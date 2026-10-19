import { query } from '../config/db.js';
import { VALUES } from '../constants/values.js';
import { STRINGS } from '../constants/strings.js';
import { DeviceStatus, AddOnPricingMode, ItemPricingType } from '../types/enums.js';
import {
  Category,
  MenuItem,
  ComboDeal,
  Employee,
  AuditLog,
  AuthorizedDevice,
  Sale,
} from '../types/models.js';

// ==========================================
// 1. CATEGORIES MANAGEMENT (RELATIONAL)
// ==========================================
export async function getAllCategoriesWithRelations() {
  const catRes = await query(`SELECT * FROM categories ORDER BY display_order ASC, id ASC;`);
  const categories: Category[] = catRes.rows;

  if (categories.length === 0) return [];

  const catIds = categories.map((c) => c.id);

  const sizesRes = await query(
    `SELECT * FROM category_sizes WHERE category_id = ANY($1::int[]) ORDER BY id ASC;`,
    [catIds]
  );
  const addOnsRes = await query(
    `SELECT * FROM category_add_ons WHERE category_id = ANY($1::int[]) ORDER BY id ASC;`,
    [catIds]
  );

  const addonIds = addOnsRes.rows.map((a: any) => a.id);
  let addonPricesRes: any = { rows: [] };
  if (addonIds.length > 0) {
    addonPricesRes = await query(
      `SELECT cap.*, cs.size_name
       FROM category_addon_prices cap
       JOIN category_sizes cs ON cap.category_size_id = cs.id
       WHERE cap.category_addon_id = ANY($1::int[]) ORDER BY cap.id ASC;`,
      [addonIds]
    );
  }

  return categories.map((c) => ({
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
      .map((a: any) => {
        const sizePrices = addonPricesRes.rows
          .filter((sp: any) => sp.category_addon_id === a.id)
          .map((sp: any) => ({
            category_size_id: sp.category_size_id,
            size_name: sp.size_name,
            price: Number(sp.price),
          }));

        return {
          id: a.id,
          enabled: true,
          add_on_name: a.add_on_name,
          pricing_mode: (a.pricing_mode as AddOnPricingMode) || AddOnPricingMode.FLAT,
          base_price: Number(a.base_price) || 0,
          price: Number(a.base_price) || 0,
          size_prices: sizePrices,
        };
      }),
  }));
}

// ==========================================
// 2. MENU ITEMS & COMBO DEALS (RELATIONAL)
// ==========================================
export async function getAllMenuItems(): Promise<any[]> {
  const itemRes = await query(`SELECT * FROM menu_items ORDER BY id DESC;`);
  const items: MenuItem[] = itemRes.rows;

  if (items.length === 0) return [];

  const itemIds = items.map((i) => i.id);

  const itemSizesRes = await query(
    `SELECT * FROM menu_item_sizes WHERE menu_item_id = ANY($1::int[]) ORDER BY display_order ASC, id ASC;`,
    [itemIds]
  );

  const itemAddonsRes = await query(
    `SELECT * FROM menu_item_addons WHERE menu_item_id = ANY($1::int[]) ORDER BY id ASC;`,
    [itemIds]
  );

  const addonIds = itemAddonsRes.rows.map((a: any) => a.id);
  let addonPricesRes: any = { rows: [] };
  if (addonIds.length > 0) {
    addonPricesRes = await query(
      `SELECT ap.*, mis.size_name
       FROM menu_item_addon_prices ap
       JOIN menu_item_sizes mis ON ap.menu_item_size_id = mis.id
       WHERE ap.menu_item_addon_id = ANY($1::int[]) ORDER BY ap.id ASC;`,
      [addonIds]
    );
  }

  return items.map((m) => {
    const sizes = itemSizesRes.rows
      .filter((s: any) => s.menu_item_id === m.id)
      .map((s: any) => ({
        id: s.id,
        size_name: s.size_name,
        price: Number(s.price),
      }));

    const addons = itemAddonsRes.rows
      .filter((a: any) => a.menu_item_id === m.id)
      .map((a: any) => {
        const sizePrices = addonPricesRes.rows
          .filter((ap: any) => ap.menu_item_addon_id === a.id)
          .map((ap: any) => ({
            menu_item_size_id: ap.menu_item_size_id,
            size_name: ap.size_name,
            price: Number(ap.price),
          }));

        return {
          id: a.id,
          addon_name: a.addon_name,
          pricing_mode: (a.pricing_mode as AddOnPricingMode) || AddOnPricingMode.FLAT,
          flat_price: Number(a.flat_price) || 0,
          price: Number(a.flat_price) || 0,
          size_prices: sizePrices,
        };
      });

    return {
      id: m.id,
      category_id: m.category_id,
      name: m.name,
      description: m.description || '',
      image_url: m.image_url || '',
      pricing_type: (m.pricing_type as ItemPricingType) || ItemPricingType.VARIABLE,
      has_variants: m.pricing_type !== 'fixed',
      base_price: m.base_price !== null ? Number(m.base_price) : null,
      single_price: m.base_price !== null ? Number(m.base_price) : null,
      sizes,
      addons,
      is_time_limited: Boolean(m.is_time_limited),
      valid_from: m.valid_from,
      valid_to: m.valid_to,
      is_active: m.is_active,
    };
  });
}

export async function getAllComboDeals(): Promise<ComboDeal[]> {
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
    SELECT c.id, c.name, c.phone_number, c.is_blocked, c.created_at,
           COUNT(o.id)::int as total_orders,
           COALESCE(MAX(ca.detailed_address), '') as detailed_address
    FROM customers c
    LEFT JOIN orders o ON (o.customer_phone = c.phone_number OR o.customer_id = c.id)
    LEFT JOIN customer_addresses ca ON (ca.customer_id = c.id AND ca.is_default = true)
    GROUP BY c.id
    ORDER BY c.id DESC;
  `);

  return custRes.rows.map((c: any) => ({
    id: c.id,
    name: c.name || '',
    phone_number: c.phone_number,
    detailed_address: c.detailed_address || '',
    is_blocked: Boolean(c.is_blocked),
    total_orders: Number(c.total_orders) || 0,
  }));
}

// ==========================================
// 4. ORDERS, POS & SALES
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
                 'unit_price', oi.unit_price
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
    created_at: o.created_at ? new Date(o.created_at).toLocaleString() : new Date().toLocaleString(),
    items: typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []),
  }));
}

export async function createOrderInDatabase(orderData: any) {
  const countRes = await query(`SELECT COUNT(*)::int as total FROM orders;`);
  const nextOrderNum = `#ORD-${1001 + (countRes.rows[0]?.total || 0)}`;

  const orderRes = await query(
    `INSERT INTO orders (order_number, order_source, order_type, customer_id, customer_name, customer_phone, delivery_address, subtotal, delivery_fee, total_amount)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
      const lineTotal = unitPrice * qty;

      const itemRes = await query(
        `INSERT INTO order_items (order_id, item_name, selected_size, selected_add_ons, quantity, unit_price)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *;`,
        [insertedOrder.id, itemName, selectedSize, selectedAddOns, qty, unitPrice]
      );
      insertedItems.push(itemRes.rows[0]);

      // Automatically Insert Sale Row into Sales Table
      await query(
        `INSERT INTO sales (order_id, order_number, order_source, order_type, item_name, category_name, quantity, unit_price, total_price, sale_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE);`,
        [
          insertedOrder.id,
          insertedOrder.order_number,
          insertedOrder.order_source,
          insertedOrder.order_type,
          itemName,
          item.category_name || item.category || 'General',
          qty,
          unitPrice,
          lineTotal,
        ]
      );
    }
  }

  return {
    ...insertedOrder,
    created_at: new Date(insertedOrder.created_at).toLocaleString(),
    items: insertedItems,
  };
}

export async function getSalesDataFromDB(): Promise<Sale[]> {
  const salesRes = await query(`SELECT * FROM sales ORDER BY id DESC;`);
  return salesRes.rows.map((s: any) => ({
    id: s.id,
    order_id: s.order_id,
    order_number: s.order_number,
    order_source: s.order_source,
    order_type: s.order_type,
    item_name: s.item_name,
    category_name: s.category_name || 'General',
    quantity: s.quantity,
    unit_price: Number(s.unit_price),
    total_price: Number(s.total_price),
    sale_date: s.sale_date,
    created_at: s.created_at ? new Date(s.created_at).toLocaleString() : new Date().toLocaleString(),
  }));
}

// ==========================================
// 5. EMPLOYEES & SYSTEM SETTINGS
// ==========================================
export async function getAllEmployeesFromDB(): Promise<Employee[]> {
  const res = await query(`SELECT * FROM employees ORDER BY id DESC;`);
  return res.rows;
}

export async function getSystemSettingsFromDB() {
  const res = await query(`SELECT setting_key, setting_value FROM system_settings;`);
  const settings: Record<string, string> = {
    opening_time: '11:00 AM',
    closing_time: '02:00 AM',
    max_cash_limit: String(VALUES.DEFAULT_MAX_CASH_LIMIT),
    delivery_fee: String(VALUES.DEFAULT_DELIVERY_FEE),
    min_takeaway_orders: '1',
    starting_cash: String(VALUES.DEFAULT_STARTING_CASH),
    maintenance_mode: 'false',
  };
  res.rows.forEach((row: any) => {
    settings[row.setting_key] = row.setting_value;
  });
  return settings;
}

// ==========================================
// 6. AUDIT LOGS & AUTHORIZED DEVICES
// ==========================================
export async function createAuditLog(log: {
  actor_name: string;
  category: string;
  action_details: string;
  ip_device?: string;
}) {
  try {
    const res = await query(
      `INSERT INTO audit_logs (actor_name, category, action_details, ip_device)
       VALUES ($1, $2, $3, $4)
       RETURNING *;`,
      [log.actor_name, log.category, log.action_details, log.ip_device || '127.0.0.1']
    );
    return res.rows[0];
  } catch (error) {
    console.error(`[DB ERROR] ${STRINGS.SEED_FAILED}`, error);
  }
}

export async function getAuditLogsFromDB(): Promise<AuditLog[]> {
  const res = await query(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT $1;`, [VALUES.AUDIT_LOG_LIMIT]);
  return res.rows.map((row: any) => ({
    id: row.id,
    actor_name: row.actor_name,
    category: row.category,
    action_details: row.action_details,
    ip_device: row.ip_device || 'N/A',
    timestamp: row.timestamp ? new Date(row.timestamp).toLocaleString() : new Date().toLocaleString(),
  }));
}

export async function getAuthorizedDevicesFromDB(): Promise<AuthorizedDevice[]> {
  const res = await query(`SELECT * FROM authorized_devices ORDER BY id DESC;`);
  return res.rows.map((d: any) => ({
    id: d.id,
    device_id: d.device_id,
    device_name: d.device_name,
    ip_address: d.ip_address || '',
    status: d.status as DeviceStatus,
    first_seen: d.first_seen ? new Date(d.first_seen).toLocaleString() : new Date().toLocaleString(),
    last_seen: d.last_seen ? new Date(d.last_seen).toLocaleString() : new Date().toLocaleString(),
    approved_at: d.approved_at ? new Date(d.approved_at).toLocaleString() : undefined,
  }));
}

export async function upsertAuthorizedDeviceInDB(dev: {
  device_id: string;
  device_name: string;
  ip_address: string;
  status: string;
}) {
  const isApproved = dev.status === DeviceStatus.APPROVED;
  const res = await query(
    `INSERT INTO authorized_devices (device_id, device_name, ip_address, status, approved_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (device_id) DO UPDATE
     SET device_name = EXCLUDED.device_name,
         ip_address = EXCLUDED.ip_address,
         last_seen = CURRENT_TIMESTAMP
     RETURNING *;`,
    [dev.device_id, dev.device_name, dev.ip_address, dev.status, isApproved ? new Date() : null]
  );
  return res.rows[0];
}

export async function updateDeviceStatusInDB(deviceId: string, status: string) {
  const isApproved = status === DeviceStatus.APPROVED;
  const res = await query(
    `UPDATE authorized_devices
     SET status = $1, approved_at = CASE WHEN $2::boolean THEN CURRENT_TIMESTAMP ELSE approved_at END
     WHERE device_id = $3 OR id::text = $3
     RETURNING *;`,
    [status, isApproved, deviceId]
  );
  return res.rows[0];
}
