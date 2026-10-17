import { query } from '../config/db.js';

// ==========================================
// 1. CATEGORIES MANAGEMENT
// ==========================================
export async function getAllCategoriesWithRelations() {
  const catRes = await query(`SELECT * FROM categories ORDER BY display_order ASC, id ASC;`);
  const categories = catRes.rows;

  if (categories.length === 0) return [];

  const catIds = categories.map((c: any) => c.id);

  const sizesRes = await query(
    `SELECT * FROM category_sizes WHERE category_id = ANY($1::int[]) ORDER BY id ASC;`,
    [catIds]
  );
  const addOnsRes = await query(
    `SELECT * FROM category_add_ons WHERE category_id = ANY($1::int[]) ORDER BY id ASC;`,
    [catIds]
  );

  return categories.map((c: any) => ({
    id: c.id,
    name: c.name,
    is_system_default: false,
    display_order: c.display_order,
    is_active: c.is_active,
    sizes: sizesRes.rows
      .filter((s: any) => s.category_id === c.id)
      .map((s: any) => ({
        id: s.id,
        enabled: true,
        size_name: s.size_name,
        base_price: Number(s.base_price),
      })),
    addOns: addOnsRes.rows
      .filter((a: any) => a.category_id === c.id)
      .map((a: any) => ({
        id: a.id,
        enabled: true,
        add_on_name: a.add_on_name,
        price: 0,
        size_prices: typeof a.size_pricing === 'string' ? JSON.parse(a.size_pricing) : (a.size_pricing || []),
      })),
  }));
}

// ==========================================
// 2. MENU ITEMS & COMBO DEALS
// ==========================================
export async function getAllMenuItems() {
  const res = await query(`SELECT * FROM menu_items ORDER BY id DESC;`);
  return res.rows.map((m: any) => ({
    id: m.id,
    category_id: m.category_id,
    name: m.name,
    description: m.description || '',
    image_url: m.image_url || '',
    has_variants: true,
    single_price: null,
    sizes: [],
    addons: [],
    is_active: m.is_active,
  }));
}

export async function getAllComboDeals() {
  const res = await query(`SELECT * FROM combo_deals ORDER BY priority_order ASC, id DESC;`);
  return res.rows.map((d: any) => ({
    id: d.id,
    name: d.name,
    description: d.description || '',
    package_price: Number(d.package_price) || 0,
    priority_order: d.priority_order || 1,
    included_items_json: typeof d.included_items_json === 'string' ? JSON.parse(d.included_items_json) : (d.included_items_json || []),
    image_url: d.image_url || '',
    is_time_limited: Boolean(d.is_time_limited),
    valid_from: d.valid_from,
    valid_to: d.valid_to,
    is_active: d.is_active,
  }));
}

// ==========================================
// 3. CUSTOMER MANAGEMENT & AUTH
// ==========================================
export async function getAllCustomersWithStats() {
  const custRes = await query(`
    SELECT u.id, u.name, u.phone_number, u.email, u.is_blocked, u.created_at,
           COUNT(o.id)::int as total_orders,
           COALESCE(MAX(ca.detailed_address), '') as detailed_address
    FROM users u
    LEFT JOIN orders o ON (o.customer_phone = u.phone_number OR o.customer_id = u.id)
    LEFT JOIN customer_addresses ca ON (ca.user_id = u.id AND ca.is_default = true)
    GROUP BY u.id
    ORDER BY u.id DESC;
  `);

  return custRes.rows.map((c: any) => ({
    id: c.id,
    name: c.name || '',
    phone_number: c.phone_number,
    email: c.email || '',
    detailed_address: c.detailed_address || '',
    is_blocked: Boolean(c.is_blocked),
    total_orders: Number(c.total_orders) || 0,
  }));
}

// ==========================================
// 4. ORDERS & POS
// ==========================================
export async function getAllOrdersWithItems() {
  const ordersRes = await query(`
    SELECT o.*,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', oi.id,
                 'itemName', oi.item_name,
                 'name', oi.item_name,
                 'selected_size', oi.selected_size,
                 'selected_add_ons', oi.selected_add_ons,
                 'quantity', oi.quantity,
                 'unit_price', oi.unit_price,
                 'special_instructions', oi.special_instructions
               )
             ) FILTER (WHERE oi.id IS NOT NULL), '[]'
           ) as items
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    GROUP BY o.id
    ORDER BY o.id DESC;
  `);

  return ordersRes.rows.map((o: any) => ({
    id: o.id,
    order_number: o.order_number,
    order_source: o.order_source,
    order_type: o.order_type,
    customer_id: o.customer_id,
    customer_name: o.customer_name || 'Walk-in Guest',
    customer_phone: o.customer_phone || '',
    delivery_address: o.delivery_address || '',
    subtotal: Number(o.subtotal) || 0,
    delivery_fee: Number(o.delivery_fee) || 0,
    total_amount: Number(o.total_amount) || 0,
    status: o.status || 'Just Placed',
    created_at: o.created_at ? new Date(o.created_at).toLocaleString() : new Date().toLocaleString(),
    items: typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []),
  }));
}

export async function createOrderInDatabase(orderData: any) {
  const countRes = await query(`SELECT COUNT(*)::int as total FROM orders;`);
  const nextOrderNum = `#ORD-${1001 + (countRes.rows[0]?.total || 0)}`;

  const orderRes = await query(
    `INSERT INTO orders (order_number, order_source, order_type, customer_id, customer_name, customer_phone, delivery_address, subtotal, delivery_fee, total_amount, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *;`,
    [
      nextOrderNum,
      orderData.order_source || 'App',
      orderData.order_type || 'Delivery',
      orderData.customer_id || null,
      orderData.customer_name || 'Customer',
      orderData.customer_phone || '',
      orderData.delivery_address || '',
      orderData.subtotal || 0,
      orderData.delivery_fee || 0,
      orderData.total_amount || 0,
      'Just Placed',
    ]
  );

  const insertedOrder = orderRes.rows[0];

  const insertedItems: any[] = [];
  if (Array.isArray(orderData.items)) {
    for (const item of orderData.items) {
      const itemName = item.itemName || item.name || 'Menu Item';
      const selectedSize = item.selected_size || item.sizeName || null;
      const selectedAddOns = JSON.stringify(item.selected_add_ons || item.addOns || []);
      const qty = Number(item.quantity) || 1;
      const unitPrice = Number(item.unit_price || item.sizePrice || item.price) || 0;
      const specialInstructions = item.special_instructions || item.instructions || null;

      const itemRes = await query(
        `INSERT INTO order_items (order_id, item_name, selected_size, selected_add_ons, quantity, unit_price, special_instructions)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *;`,
        [insertedOrder.id, itemName, selectedSize, selectedAddOns, qty, unitPrice, specialInstructions]
      );
      insertedItems.push(itemRes.rows[0]);
    }
  }

  return {
    ...insertedOrder,
    created_at: new Date(insertedOrder.created_at).toLocaleString(),
    items: insertedItems,
  };
}

// ==========================================
// 5. EMPLOYEES & SYSTEM SETTINGS
// ==========================================
export async function getAllEmployeesFromDB() {
  const res = await query(`SELECT * FROM employees ORDER BY id DESC;`);
  return res.rows;
}

export async function getSystemSettingsFromDB() {
  const res = await query(`SELECT setting_key, setting_value FROM system_settings;`);
  const settings: Record<string, string> = {
    opening_time: '11:00 AM',
    closing_time: '02:00 AM',
    max_cash_limit: '5000',
    delivery_fee: '150',
    min_takeaway_orders: '1',
    starting_cash: '10000',
    maintenance_mode: 'false',
  };
  res.rows.forEach((row: any) => {
    settings[row.setting_key] = row.setting_value;
  });
  return settings;
}
