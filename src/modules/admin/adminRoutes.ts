import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { env } from '../../config/config.js';
import { query } from '../../config/db.js';
import { adminAuthGuard, AdminRequest } from '../../middleware/adminAuthGuard.js';
import { uploadMiddleware, getImageUrl } from '../../services/uploadService.js';
import { parseDeviceName } from '../../services/deviceService.js';
import {
  getAllCategoriesWithRelations,
  getAllMenuItems,
  getAllComboDeals,
  getAllCustomersWithStats,
  getAllOrdersWithItems,
  createOrderInDatabase,
  getAllEmployeesFromDB,
  getSystemSettingsFromDB,
  createAuditLog,
  getAuditLogsFromDB,
} from '../../services/dbStore.js';
import {
  authorizedDevices,
  AdminDevice,
} from './adminStore.js';

const router = Router();

function deleteOldUploadFile(imageUrl: string | null | undefined) {
  if (!imageUrl) return;
  try {
    const filename = imageUrl.split('/uploads/').pop();
    if (filename && !filename.startsWith('http')) {
      const filePath = path.resolve(process.cwd(), 'uploads', filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  } catch (err) {
    console.warn('[Storage] Failed to delete old upload file:', err);
  }
}

// ==========================================
// 1. AUTHENTICATION & DEVICE SECURITY MODULE
// ==========================================
router.post('/auth/sign-in', async (req: Request, res: Response) => {
  const { email, password, deviceId } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password required' });
  }

  if (
    email.trim().toLowerCase() === env.ADMIN_EMAIL.toLowerCase() &&
    password === env.ADMIN_PASSWORD
  ) {
    const realDeviceName = parseDeviceName(req);
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.ip || '127.0.0.1';
    const clientDeviceId = deviceId || 'dev_primary_001';

    let device = authorizedDevices.find((d) => d.device_id === clientDeviceId);

    if (authorizedDevices.length === 0) {
      device = {
        id: `dev_${Date.now()}`,
        device_id: clientDeviceId,
        device_name: realDeviceName,
        ip_address: clientIp,
        status: 'approved',
        first_seen: new Date().toLocaleString(),
        last_seen: new Date().toLocaleString(),
        approved_at: new Date().toLocaleString(),
      };
      authorizedDevices.push(device);
    } else if (!device) {
      device = {
        id: `dev_${Date.now()}`,
        device_id: clientDeviceId,
        device_name: realDeviceName,
        ip_address: clientIp,
        status: 'pending_approval',
        first_seen: new Date().toLocaleString(),
        last_seen: new Date().toLocaleString(),
      };
      authorizedDevices.push(device);

      await createAuditLog({
        actor_name: env.ADMIN_NAME,
        category: 'Device Security',
        action_details: `New device login request pending authorization: ${realDeviceName}`,
        ip_device: `${realDeviceName} (${clientIp})`,
      });
    } else {
      device.last_seen = new Date().toLocaleString();
      device.device_name = realDeviceName;
      device.ip_address = clientIp;
    }

    if (device.status === 'blocked') {
      return res.status(403).json({
        success: false,
        accountStatus: 'Device Blocked',
        message: 'This device has been blocked from accessing the Admin Portal.',
      });
    }

    if (device.status === 'pending_approval') {
      return res.status(403).json({
        success: false,
        accountStatus: 'Device Pending Approval',
        message: 'This device is pending authorization by the primary administrator.',
      });
    }

    const adminUser = {
      id: 1,
      name: env.ADMIN_NAME,
      email: env.ADMIN_EMAIL,
      role: env.ADMIN_ROLE,
    };

    const token = jwt.sign(adminUser, env.ADMIN_JWT_SECRET, { expiresIn: '7d' });

    await createAuditLog({
      actor_name: env.ADMIN_NAME,
      category: 'Authentication',
      action_details: `Admin signed in successfully from ${realDeviceName}`,
      ip_device: `${realDeviceName} (${clientIp})`,
    });

    return res.json({
      success: true,
      message: 'Signed in successfully',
      token,
      user: adminUser,
    });
  }

  return res.status(401).json({ success: false, message: 'Invalid admin email or password' });
});

router.post('/auth/sign-out', async (req: Request, res: Response) => {
  const realDeviceName = parseDeviceName(req);
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.ip || '127.0.0.1';

  await createAuditLog({
    actor_name: env.ADMIN_NAME,
    category: 'Authentication',
    action_details: `Admin signed out from ${realDeviceName}`,
    ip_device: `${realDeviceName} (${clientIp})`,
  });

  res.json({ success: true, message: 'Signed out successfully' });
});

router.get('/devices', (req: Request, res: Response) => {
  res.json({ success: true, data: authorizedDevices });
});

router.post('/devices/:id/approve', async (req: Request, res: Response) => {
  const dev = authorizedDevices.find((d) => d.id === req.params.id || d.device_id === req.params.id);
  if (!dev) return res.status(404).json({ success: false, message: 'Device not found' });

  dev.status = 'approved';
  dev.approved_at = new Date().toLocaleString();

  await createAuditLog({
    actor_name: env.ADMIN_NAME,
    category: 'Device Security',
    action_details: `Approved device: ${dev.device_name} (${dev.ip_address})`,
    ip_device: parseDeviceName(req),
  });

  res.json({ success: true, message: 'Device approved successfully', data: dev });
});

router.post('/devices/:id/block', async (req: Request, res: Response) => {
  const dev = authorizedDevices.find((d) => d.id === req.params.id || d.device_id === req.params.id);
  if (!dev) return res.status(404).json({ success: false, message: 'Device not found' });

  dev.status = 'blocked';

  await createAuditLog({
    actor_name: env.ADMIN_NAME,
    category: 'Device Security',
    action_details: `Blocked device: ${dev.device_name} (${dev.ip_address})`,
    ip_device: parseDeviceName(req),
  });

  res.json({ success: true, message: 'Device blocked successfully', data: dev });
});

router.post('/devices/:id/unblock', async (req: Request, res: Response) => {
  const dev = authorizedDevices.find((d) => d.id === req.params.id || d.device_id === req.params.id);
  if (!dev) return res.status(404).json({ success: false, message: 'Device not found' });

  dev.status = 'approved';

  await createAuditLog({
    actor_name: env.ADMIN_NAME,
    category: 'Device Security',
    action_details: `Unblocked device: ${dev.device_name} (${dev.ip_address})`,
    ip_device: parseDeviceName(req),
  });

  res.json({ success: true, message: 'Device unblocked successfully', data: dev });
});

// Protected Admin Routes Below
router.use(adminAuthGuard as any);

// ==========================================
// 2. DASHBOARD MODULE
// ==========================================
router.get('/dashboard/sales-digest', async (req: Request, res: Response, next) => {
  try {
    const adminOrders = await getAllOrdersWithItems();
    const totalOrders = adminOrders.length;
    const grossSales = adminOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const dineInOrders = adminOrders.filter((o) => o.order_type === 'Dine-In').length;
    const takeawayOrders = adminOrders.filter((o) => o.order_type === 'Takeaway').length;
    const deliveryOrders = adminOrders.filter((o) => o.order_type === 'Delivery').length;
    const averageOrderValue = totalOrders > 0 ? Math.round(grossSales / totalOrders) : 0;

    res.json({
      success: true,
      data: {
        grossSales,
        totalOrders,
        dineInOrders,
        takeawayOrders,
        deliveryOrders,
        averageOrderValue,
        peakBusyHours: totalOrders > 0 ? '7:00 PM - 9:00 PM' : 'No Orders Yet',
        paymentSplit: { cash: grossSales, cardTransfer: 0 },
        hourlySales: [],
        rows: adminOrders.map((o) => ({
          fullDate: o.created_at,
          channel: o.order_source,
          totalOrders: 1,
          grossRevenue: o.total_amount,
          discounts: 0,
          netSales: o.total_amount,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/dashboard/item-category-sales', async (req: Request, res: Response, next) => {
  try {
    const adminOrders = await getAllOrdersWithItems();
    const totalOrders = adminOrders.length;
    const grossSales = adminOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);

    res.json({
      success: true,
      data: {
        topDish: totalOrders > 0 ? 'Popular Menu Item' : 'No Sales Yet',
        topCategory: totalOrders > 0 ? 'Main Category' : 'No Categories Sold Yet',
        categoryRevenue: grossSales > 0 ? [{ name: 'Main Category', revenue: grossSales, percentage: 100 }] : [],
        categoryBestSellers: [],
        overallBestSellers: [],
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/dashboard/audit-log', async (req: Request, res: Response, next) => {
  try {
    const logs = await getAuditLogsFromDB();
    res.json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 3. POS TERMINAL MODULE
// ==========================================
router.get('/pos/menu', async (req: Request, res: Response, next) => {
  try {
    const categories = await getAllCategoriesWithRelations();
    const items = await getAllMenuItems();
    res.json({ success: true, categories, items });
  } catch (error) {
    next(error);
  }
});

router.get('/pos/deals', async (req: Request, res: Response, next) => {
  try {
    const deals = await getAllComboDeals();
    res.json({ success: true, deals });
  } catch (error) {
    next(error);
  }
});

router.post('/pos/order', async (req: Request, res: Response, next) => {
  try {
    const { orderType, customerName, customerPhone, deliveryAddress, items, totalAmount } = req.body;
    const settings = await getSystemSettingsFromDB();
    const deliveryFee = orderType === 'Delivery' ? (Number(settings.delivery_fee) || 150) : 0;

    const newOrder = await createOrderInDatabase({
      order_source: 'POS',
      order_type: orderType || 'Dine-In',
      customer_id: null,
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
      delivery_address: deliveryAddress || null,
      subtotal: totalAmount || 1000,
      delivery_fee: deliveryFee,
      total_amount: (totalAmount || 1000) + deliveryFee,
      items: items || [],
    });

    await createAuditLog({
      actor_name: env.ADMIN_NAME,
      category: 'POS Order',
      action_details: `Placed POS Order ${newOrder.order_number} (${orderType}) for ${customerName || 'Walk-in Guest'} (Rs. ${totalAmount})`,
      ip_device: parseDeviceName(req),
    });

    res.status(201).json({ success: true, message: 'POS Order placed successfully', order: newOrder });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 4. ORDERS & HISTORY MODULE
// ==========================================
router.get('/orders', async (req: Request, res: Response, next) => {
  try {
    const { search, source, type } = req.query;
    let list = await getAllOrdersWithItems();

    if (source && source !== 'all') {
      list = list.filter((o) => o.order_source.toLowerCase() === (source as string).toLowerCase());
    }

    if (type && type !== 'all') {
      list = list.filter((o) => o.order_type.toLowerCase() === (type as string).toLowerCase());
    }

    if (search && (search as string).trim()) {
      const q = (search as string).trim().toLowerCase();
      list = list.filter(
        (o) =>
          o.order_number.toLowerCase().includes(q) ||
          (o.customer_name && o.customer_name.toLowerCase().includes(q)) ||
          (o.customer_phone && o.customer_phone.toLowerCase().includes(q))
      );
    }

    res.json({ success: true, data: list });
  } catch (error) {
    next(error);
  }
});

router.get('/orders/:id', async (req: Request, res: Response, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const orders = await getAllOrdersWithItems();
    const order = orders.find((o) => o.id === id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 5. MENU CATEGORIES MODULE
// ==========================================
router.get('/categories', async (req: Request, res: Response, next) => {
  try {
    const categories = await getAllCategoriesWithRelations();
    res.json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
});

router.post('/categories', async (req: Request, res: Response, next) => {
  try {
    const { name, sizes, addOns } = req.body;

    const countRes = await query(`SELECT COUNT(*)::int as total FROM categories;`);
    const nextOrder = (countRes.rows[0]?.total || 0) + 1;

    const catRes = await query(
      `INSERT INTO categories (name, display_order, is_active) VALUES ($1, $2, true) RETURNING *;`,
      [name || 'New Category', nextOrder]
    );
    const newCat = catRes.rows[0];

    const insertedSizes: any[] = [];
    if (Array.isArray(sizes)) {
      for (const s of sizes) {
        if (s.enabled !== false && String(s.size_name || s.sizeName || '').trim()) {
          const sName = String(s.size_name || s.sizeName).trim();
          const sPrice = Number(s.base_price || s.price) || 0;
          const sizeRes = await query(
            `INSERT INTO category_sizes (category_id, size_name, base_price) VALUES ($1, $2, $3) RETURNING *;`,
            [newCat.id, sName, sPrice]
          );
          insertedSizes.push({
            id: sizeRes.rows[0].id,
            enabled: true,
            size_name: sizeRes.rows[0].size_name,
            base_price: Number(sizeRes.rows[0].base_price),
          });
        }
      }
    }

    const insertedAddOns: any[] = [];
    if (Array.isArray(addOns)) {
      for (const a of addOns) {
        if (a.enabled !== false && String(a.add_on_name || a.addonName || a.name || '').trim()) {
          const aName = String(a.add_on_name || a.addonName || a.name).trim();
          const sizePrices = Array.isArray(a.size_prices || a.sizePrices)
            ? (a.size_prices || a.sizePrices).filter((sp: any) => sp.enabled !== false)
            : [];
          const addOnRes = await query(
            `INSERT INTO category_add_ons (category_id, add_on_name, size_pricing) VALUES ($1, $2, $3) RETURNING *;`,
            [newCat.id, aName, JSON.stringify(sizePrices)]
          );
          insertedAddOns.push({
            id: addOnRes.rows[0].id,
            enabled: true,
            add_on_name: addOnRes.rows[0].add_on_name,
            price: Number(a.price) || 0,
            size_prices: sizePrices,
          });
        }
      }
    }

    res.status(201).json({
      success: true,
      message: 'Category created',
      data: {
        id: newCat.id,
        name: newCat.name,
        display_order: newCat.display_order,
        is_active: newCat.is_active,
        sizes: insertedSizes,
        addOns: insertedAddOns,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.put('/categories/:id', async (req: Request, res: Response, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, is_active, sizes, addOns } = req.body;

    const checkRes = await query(`SELECT * FROM categories WHERE id = $1;`, [id]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    if (name !== undefined) {
      await query(`UPDATE categories SET name = $1 WHERE id = $2;`, [name, id]);
    }
    if (is_active !== undefined) {
      await query(`UPDATE categories SET is_active = $1 WHERE id = $2;`, [Boolean(is_active), id]);
    }

    if (Array.isArray(sizes)) {
      await query(`DELETE FROM category_sizes WHERE category_id = $1;`, [id]);
      for (const s of sizes) {
        if (s.enabled !== false && String(s.size_name || s.sizeName || '').trim()) {
          const sName = String(s.size_name || s.sizeName).trim();
          const sPrice = Number(s.base_price || s.price) || 0;
          await query(
            `INSERT INTO category_sizes (category_id, size_name, base_price) VALUES ($1, $2, $3);`,
            [id, sName, sPrice]
          );
        }
      }
    }

    if (Array.isArray(addOns)) {
      await query(`DELETE FROM category_add_ons WHERE category_id = $1;`, [id]);
      for (const a of addOns) {
        if (a.enabled !== false && String(a.add_on_name || a.addonName || a.name || '').trim()) {
          const aName = String(a.add_on_name || a.addonName || a.name).trim();
          const sizePrices = Array.isArray(a.size_prices || a.sizePrices)
            ? (a.size_prices || a.sizePrices).filter((sp: any) => sp.enabled !== false)
            : [];
          await query(
            `INSERT INTO category_add_ons (category_id, add_on_name, size_pricing) VALUES ($1, $2, $3);`,
            [id, aName, JSON.stringify(sizePrices)]
          );
        }
      }
    }

    const updatedCategories = await getAllCategoriesWithRelations();
    const updatedCat = updatedCategories.find((c: any) => c.id === id);

    res.json({ success: true, message: 'Category updated', data: updatedCat });
  } catch (error) {
    next(error);
  }
});

router.delete('/categories/:id', async (req: Request, res: Response, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const checkRes = await query(`SELECT * FROM categories WHERE id = $1;`, [id]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    await query(`DELETE FROM categories WHERE id = $1;`, [id]);
    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 6. MENU ITEMS MODULE
// ==========================================
router.get('/menu', async (req: Request, res: Response, next) => {
  try {
    const items = await getAllMenuItems();
    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
});

router.post('/menu', async (req: Request, res: Response, next) => {
  try {
    const category_id = parseInt(req.body.category_id, 10) || 1;
    const name = req.body.name || 'New Item';
    const description = req.body.description || '';
    const image_url = req.body.image_url || '';
    const is_time_limited = Boolean(req.body.is_time_limited);
    const valid_from = req.body.valid_from || null;
    const valid_to = req.body.valid_to || null;

    const result = await query(
      `INSERT INTO menu_items (category_id, name, description, image_url, is_time_limited, valid_from, valid_to, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       RETURNING *;`,
      [category_id, name, description, image_url, is_time_limited, valid_from, valid_to]
    );

    const inserted = result.rows[0];
    res.status(201).json({
      success: true,
      message: 'Menu item created',
      data: {
        id: inserted.id,
        category_id: inserted.category_id,
        name: inserted.name,
        description: inserted.description || '',
        image_url: inserted.image_url || '',
        has_variants: true,
        single_price: null,
        sizes: req.body.sizes || [],
        addons: req.body.addons || [],
        is_active: inserted.is_active,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.put('/menu/:id', async (req: Request, res: Response, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const checkRes = await query(`SELECT * FROM menu_items WHERE id = $1;`, [id]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Menu item not found' });
    }
    const currentItem = checkRes.rows[0];

    if (req.body.image_url && req.body.image_url !== currentItem.image_url) {
      deleteOldUploadFile(currentItem.image_url);
    }

    const category_id = req.body.category_id ? parseInt(req.body.category_id, 10) : currentItem.category_id;
    const name = req.body.name !== undefined ? req.body.name : currentItem.name;
    const description = req.body.description !== undefined ? req.body.description : currentItem.description;
    const image_url = req.body.image_url !== undefined ? req.body.image_url : currentItem.image_url;

    const updateRes = await query(
      `UPDATE menu_items
       SET category_id = $1, name = $2, description = $3, image_url = $4
       WHERE id = $5
       RETURNING *;`,
      [category_id, name, description, image_url, id]
    );

    const updated = updateRes.rows[0];
    res.json({
      success: true,
      message: 'Menu item updated',
      data: {
        id: updated.id,
        category_id: updated.category_id,
        name: updated.name,
        description: updated.description || '',
        image_url: updated.image_url || '',
        has_variants: true,
        single_price: null,
        sizes: req.body.sizes || [],
        addons: req.body.addons || [],
        is_active: updated.is_active,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/menu/:id/toggle', async (req: Request, res: Response, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await query(
      `UPDATE menu_items SET is_active = NOT is_active WHERE id = $1 RETURNING *;`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Menu item not found' });
    }

    const item = result.rows[0];
    res.json({ success: true, message: `Menu item ${item.is_active ? 'enabled' : 'disabled'}`, data: item });
  } catch (error) {
    next(error);
  }
});

router.delete('/menu/:id', async (req: Request, res: Response, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const checkRes = await query(`SELECT * FROM menu_items WHERE id = $1;`, [id]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Menu item not found' });
    }

    deleteOldUploadFile(checkRes.rows[0].image_url);
    await query(`DELETE FROM menu_items WHERE id = $1;`, [id]);
    res.json({ success: true, message: 'Menu item deleted' });
  } catch (error) {
    next(error);
  }
});

// --- Combo Deals ---
router.get('/deals', async (req: Request, res: Response, next) => {
  try {
    const deals = await getAllComboDeals();
    res.json({ success: true, data: deals });
  } catch (error) {
    next(error);
  }
});

router.post('/deals', async (req: Request, res: Response, next) => {
  try {
    let includedItems = [];
    try {
      includedItems = typeof req.body.included_items_json === 'string'
        ? JSON.parse(req.body.included_items_json)
        : req.body.included_items_json || [];
    } catch {
      includedItems = [];
    }

    const name = req.body.name || 'New Combo Deal';
    const description = req.body.description || '';
    const package_price = Number(req.body.package_price) || 0;
    const priority_order = Number(req.body.priority_order) || 1;
    const image_url = req.body.image_url || '';
    const is_time_limited = Boolean(req.body.is_time_limited);
    const valid_from = req.body.valid_from || null;
    const valid_to = req.body.valid_to || null;

    const result = await query(
      `INSERT INTO combo_deals (name, description, package_price, priority_order, included_items_json, image_url, is_time_limited, valid_from, valid_to, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
       RETURNING *;`,
      [
        name,
        description,
        package_price,
        priority_order,
        JSON.stringify(includedItems),
        image_url,
        is_time_limited,
        valid_from,
        valid_to,
      ]
    );

    const inserted = result.rows[0];
    res.status(201).json({
      success: true,
      message: 'Combo deal created',
      data: {
        ...inserted,
        package_price: Number(inserted.package_price),
        included_items_json: typeof inserted.included_items_json === 'string'
          ? JSON.parse(inserted.included_items_json)
          : inserted.included_items_json,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.put('/deals/:id', async (req: Request, res: Response, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const checkRes = await query(`SELECT * FROM combo_deals WHERE id = $1;`, [id]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Deal not found' });
    }
    const currentDeal = checkRes.rows[0];

    if (req.body.image_url && req.body.image_url !== currentDeal.image_url) {
      deleteOldUploadFile(currentDeal.image_url);
    }

    const name = req.body.name !== undefined ? req.body.name : currentDeal.name;
    const description = req.body.description !== undefined ? req.body.description : currentDeal.description;
    const package_price = req.body.package_price !== undefined ? Number(req.body.package_price) : currentDeal.package_price;
    const priority_order = req.body.priority_order !== undefined ? Number(req.body.priority_order) : currentDeal.priority_order;
    const image_url = req.body.image_url !== undefined ? req.body.image_url : currentDeal.image_url;

    const updateRes = await query(
      `UPDATE combo_deals
       SET name = $1, description = $2, package_price = $3, priority_order = $4, image_url = $5
       WHERE id = $6
       RETURNING *;`,
      [name, description, package_price, priority_order, image_url, id]
    );

    const updated = updateRes.rows[0];
    res.json({
      success: true,
      message: 'Combo deal updated',
      data: {
        ...updated,
        package_price: Number(updated.package_price),
        included_items_json: typeof updated.included_items_json === 'string'
          ? JSON.parse(updated.included_items_json)
          : updated.included_items_json,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/deals/:id/toggle', async (req: Request, res: Response, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await query(
      `UPDATE combo_deals SET is_active = NOT is_active WHERE id = $1 RETURNING *;`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Deal not found' });
    }

    const deal = result.rows[0];
    res.json({ success: true, message: `Deal ${deal.is_active ? 'enabled' : 'disabled'}`, data: deal });
  } catch (error) {
    next(error);
  }
});

router.delete('/deals/:id', async (req: Request, res: Response, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const checkRes = await query(`SELECT * FROM combo_deals WHERE id = $1;`, [id]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Deal not found' });
    }

    deleteOldUploadFile(checkRes.rows[0].image_url);
    await query(`DELETE FROM combo_deals WHERE id = $1;`, [id]);
    res.json({ success: true, message: 'Combo deal deleted' });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 7. EMPLOYEES MANAGEMENT MODULE
// ==========================================
router.get('/employees', async (req: Request, res: Response, next) => {
  try {
    const employees = await getAllEmployeesFromDB();
    res.json({ success: true, data: employees });
  } catch (error) {
    next(error);
  }
});

router.post('/employees', async (req: Request, res: Response, next) => {
  try {
    const full_name = req.body.full_name || 'New Staff Member';
    const phone_number = req.body.phone_number || '';
    const address = req.body.address || '';
    const position = req.body.position || 'Chef';

    const result = await query(
      `INSERT INTO employees (full_name, phone_number, address, position)
       VALUES ($1, $2, $3, $4)
       RETURNING *;`,
      [full_name, phone_number, address, position]
    );

    res.status(201).json({ success: true, message: 'Employee created', data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.put('/employees/:id', async (req: Request, res: Response, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { full_name, phone_number, address, position } = req.body;

    const result = await query(
      `UPDATE employees
       SET full_name = COALESCE($1, full_name),
           phone_number = COALESCE($2, phone_number),
           address = COALESCE($3, address),
           position = COALESCE($4, position)
       WHERE id = $5
       RETURNING *;`,
      [full_name, phone_number, address, position, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    res.json({ success: true, message: 'Employee updated', data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete('/employees/:id', async (req: Request, res: Response, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await query(`DELETE FROM employees WHERE id = $1 RETURNING *;`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }
    res.json({ success: true, message: 'Employee deleted' });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 8. CUSTOMER MANAGEMENT MODULE
// ==========================================
router.get('/customers', async (req: Request, res: Response, next) => {
  try {
    const customers = await getAllCustomersWithStats();
    res.json({ success: true, data: customers });
  } catch (error) {
    next(error);
  }
});

router.post('/customers', async (req: Request, res: Response, next) => {
  try {
    const name = req.body.name || 'New Customer';
    const phone_number = req.body.phone_number || '';
    const detailed_address = req.body.detailed_address || '';
    const is_blocked = Boolean(req.body.is_blocked);

    const userRes = await query(
      `INSERT INTO users (phone_number, name, is_verified, is_blocked)
       VALUES ($1, $2, true, $3)
       ON CONFLICT (phone_number) DO UPDATE SET name = EXCLUDED.name, is_blocked = EXCLUDED.is_blocked
       RETURNING *;`,
      [phone_number, name, is_blocked]
    );
    const user = userRes.rows[0];

    if (detailed_address) {
      await query(
        `INSERT INTO customer_addresses (user_id, address_title, detailed_address, is_default)
         VALUES ($1, 'Home', $2, true);`,
        [user.id, detailed_address]
      );
    }

    res.status(201).json({
      success: true,
      message: 'Customer record created',
      data: {
        id: user.id,
        name: user.name,
        phone_number: user.phone_number,
        detailed_address,
        is_blocked: user.is_blocked,
        total_orders: 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.put('/customers/:id', async (req: Request, res: Response, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, phone_number, detailed_address, is_blocked } = req.body;

    const userRes = await query(
      `UPDATE users
       SET name = COALESCE($1, name),
           phone_number = COALESCE($2, phone_number),
           is_blocked = COALESCE($3, is_blocked)
       WHERE id = $4
       RETURNING *;`,
      [name, phone_number, is_blocked !== undefined ? Boolean(is_blocked) : null, id]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    if (detailed_address !== undefined) {
      await query(
        `INSERT INTO customer_addresses (user_id, address_title, detailed_address, is_default)
         VALUES ($1, 'Home', $2, true);`,
        [id, detailed_address]
      );
    }

    res.json({ success: true, message: 'Customer record updated', data: userRes.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete('/customers/:id', async (req: Request, res: Response, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await query(`DELETE FROM users WHERE id = $1 RETURNING *;`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    res.json({ success: true, message: 'Customer record deleted' });
  } catch (error) {
    next(error);
  }
});

router.post('/customers/:id/toggle-block', async (req: Request, res: Response, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await query(
      `UPDATE users SET is_blocked = NOT is_blocked WHERE id = $1 RETURNING *;`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const cust = result.rows[0];
    res.json({ success: true, message: `Customer ${cust.is_blocked ? 'blocked' : 'unblocked'}`, data: cust });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 9. RESTAURANT & APP MANAGEMENT SETTINGS
// ==========================================
router.get('/restaurant/settings', async (req: Request, res: Response, next) => {
  try {
    const settings = await getSystemSettingsFromDB();
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
});

router.post('/restaurant/settings', async (req: Request, res: Response, next) => {
  try {
    const body = req.body || {};
    for (const [key, value] of Object.entries(body)) {
      await query(
        `INSERT INTO system_settings (setting_key, setting_value)
         VALUES ($1, $2)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;`,
        [key, String(value)]
      );
    }
    const updatedSettings = await getSystemSettingsFromDB();
    res.json({ success: true, message: 'Restaurant settings updated', data: updatedSettings });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 10. PROFILE & MEDIA UPLOAD MODULE
// ==========================================
router.get('/profile', (req: AdminRequest, res: Response) => {
  res.json({ success: true, data: req.admin });
});

router.post('/upload', uploadMiddleware.single('image'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  const imageUrl = getImageUrl(req.file.filename);
  res.json({
    success: true,
    message: 'File uploaded successfully',
    filename: req.file.filename,
    imageUrl,
  });
});

export default router;
