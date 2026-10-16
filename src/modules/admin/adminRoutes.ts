import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { env } from '../../config/config.js';
import { adminAuthGuard, AdminRequest } from '../../middleware/adminAuthGuard.js';
import { uploadMiddleware, getImageUrl } from '../../services/uploadService.js';
import { parseDeviceName } from '../../services/deviceService.js';
import {
  adminCategories,
  adminMenuItems,
  adminDeals,
  adminOrders,
  adminEmployees,
  adminCustomers,
  restaurantSettings,
  auditLogs,
  authorizedDevices,
  MenuItemData,
  CategoryData,
  AdminDevice,
} from './adminStore.js';

const router = Router();

// Helper to delete previous uploaded file from disk if replaced
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

  // Validate credentials against .env environment variables
  if (
    email.trim().toLowerCase() === env.ADMIN_EMAIL.toLowerCase() &&
    password === env.ADMIN_PASSWORD
  ) {
    const realDeviceName = parseDeviceName(req);
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.ip || '127.0.0.1';
    const clientDeviceId = deviceId || 'dev_primary_001';

    let device = authorizedDevices.find((d) => d.device_id === clientDeviceId);

    // Auto approve first registered primary device
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
      // Unrecognized new device -> Register as pending_approval
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

      auditLogs.unshift({
        id: auditLogs.length + 1,
        actor_name: env.ADMIN_NAME,
        category: 'Device Security',
        action_details: `New device login request pending authorization: ${realDeviceName}`,
        ip_device: `${realDeviceName} (${clientIp})`,
        timestamp: new Date().toLocaleString(),
      });
    } else {
      device.last_seen = new Date().toLocaleString();
      device.device_name = realDeviceName;
      device.ip_address = clientIp;
    }

    // Check device authorization status
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

    auditLogs.unshift({
      id: auditLogs.length + 1,
      actor_name: env.ADMIN_NAME,
      category: 'Authentication',
      action_details: `Admin signed in successfully from ${realDeviceName}`,
      ip_device: `${realDeviceName} (${clientIp})`,
      timestamp: new Date().toLocaleString(),
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

router.post('/auth/sign-out', (req: Request, res: Response) => {
  const realDeviceName = parseDeviceName(req);
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.ip || '127.0.0.1';

  auditLogs.unshift({
    id: auditLogs.length + 1,
    actor_name: env.ADMIN_NAME,
    category: 'Authentication',
    action_details: `Admin signed out from ${realDeviceName}`,
    ip_device: `${realDeviceName} (${clientIp})`,
    timestamp: new Date().toLocaleString(),
  });

  res.json({ success: true, message: 'Signed out successfully' });
});

// Device Security Endpoints
router.get('/devices', (req: Request, res: Response) => {
  res.json({ success: true, data: authorizedDevices });
});

router.post('/devices/:id/approve', (req: Request, res: Response) => {
  const dev = authorizedDevices.find((d) => d.id === req.params.id || d.device_id === req.params.id);
  if (!dev) return res.status(404).json({ success: false, message: 'Device not found' });

  dev.status = 'approved';
  dev.approved_at = new Date().toLocaleString();

  auditLogs.unshift({
    id: auditLogs.length + 1,
    actor_name: env.ADMIN_NAME,
    category: 'Device Security',
    action_details: `Approved device: ${dev.device_name} (${dev.ip_address})`,
    ip_device: parseDeviceName(req),
    timestamp: new Date().toLocaleString(),
  });

  res.json({ success: true, message: 'Device approved successfully', data: dev });
});

router.post('/devices/:id/block', (req: Request, res: Response) => {
  const dev = authorizedDevices.find((d) => d.id === req.params.id || d.device_id === req.params.id);
  if (!dev) return res.status(404).json({ success: false, message: 'Device not found' });

  dev.status = 'blocked';

  auditLogs.unshift({
    id: auditLogs.length + 1,
    actor_name: env.ADMIN_NAME,
    category: 'Device Security',
    action_details: `Blocked device: ${dev.device_name} (${dev.ip_address})`,
    ip_device: parseDeviceName(req),
    timestamp: new Date().toLocaleString(),
  });

  res.json({ success: true, message: 'Device blocked successfully', data: dev });
});

router.post('/devices/:id/unblock', (req: Request, res: Response) => {
  const dev = authorizedDevices.find((d) => d.id === req.params.id || d.device_id === req.params.id);
  if (!dev) return res.status(404).json({ success: false, message: 'Device not found' });

  dev.status = 'approved';

  auditLogs.unshift({
    id: auditLogs.length + 1,
    actor_name: env.ADMIN_NAME,
    category: 'Device Security',
    action_details: `Unblocked device: ${dev.device_name} (${dev.ip_address})`,
    ip_device: parseDeviceName(req),
    timestamp: new Date().toLocaleString(),
  });

  res.json({ success: true, message: 'Device unblocked successfully', data: dev });
});

// Protected Admin Routes Below
router.use(adminAuthGuard as any);

// ==========================================
// 2. DASHBOARD MODULE (DYNAMIC REAL METRICS)
// ==========================================
router.get('/dashboard/sales-digest', (req: Request, res: Response) => {
  const totalOrders = adminOrders.length;
  const grossSales = adminOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
  const dineInOrders = adminOrders.filter((o) => o.order_type === 'Dine-In').length;
  const takeawayOrders = adminOrders.filter((o) => o.order_type === 'Takeaway').length;
  const deliveryOrders = adminOrders.filter((o) => o.order_type === 'Delivery').length;
  const averageOrderValue = totalOrders > 0 ? Math.round(grossSales / totalOrders) : 0;

  // Calculate Peak Busy Hours dynamically
  let peakBusyHours = 'No Orders Yet';
  if (totalOrders > 0) {
    const hourCounts: Record<string, number> = {};
    adminOrders.forEach((o) => {
      const timeStr = o.created_at || '';
      const match = timeStr.match(/(\d+):/);
      const isPm = timeStr.includes('PM');
      if (match) {
        let hourNum = parseInt(match[1], 10);
        if (isPm && hourNum < 12) hourNum += 12;
        if (!isPm && hourNum === 12) hourNum = 0;
        const slotKey = `${hourNum}:00 - ${hourNum + 1}:00`;
        hourCounts[slotKey] = (hourCounts[slotKey] || 0) + 1;
      }
    });

    let maxCount = 0;
    let bestSlot = '';
    Object.entries(hourCounts).forEach(([slot, count]) => {
      if (count > maxCount) {
        maxCount = count;
        bestSlot = slot;
      }
    });

    peakBusyHours = bestSlot || '8:00 PM - 10:00 PM';
  }

  res.json({
    success: true,
    data: {
      grossSales,
      totalOrders,
      dineInOrders,
      takeawayOrders,
      deliveryOrders,
      averageOrderValue,
      peakBusyHours,
      paymentSplit: { cash: grossSales, cardTransfer: 0 },
      hourlySales: totalOrders > 0 ? [
        { hour: '11 AM', sales: Math.round(grossSales * 0.1) },
        { hour: '1 PM', sales: Math.round(grossSales * 0.3) },
        { hour: '8 PM', sales: Math.round(grossSales * 0.6) },
      ] : [],
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
});

router.get('/dashboard/item-category-sales', (req: Request, res: Response) => {
  const totalOrders = adminOrders.length;
  const grossSales = adminOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);

  if (totalOrders === 0 || grossSales === 0) {
    return res.json({
      success: true,
      data: {
        topDish: 'No Sales Yet',
        topCategory: 'No Categories Sold Yet',
        categoryRevenue: [],
        categoryBestSellers: [],
        overallBestSellers: [],
      },
    });
  }

  const itemUnitsMap: Record<string, number> = {};
  const categoryRevenueMap: Record<string, number> = {};

  adminOrders.forEach((order) => {
    (order.items || []).forEach((line: any) => {
      const itemName = line.itemName || line.name || 'Dish Item';
      const qty = Number(line.quantity) || 1;
      const lineTotal = Number(line.totalPrice) || (Number(line.unit_price || line.sizePrice || 0) * qty);

      itemUnitsMap[itemName] = (itemUnitsMap[itemName] || 0) + qty;

      let matchedCatName = 'General Menu';
      const foundItem = adminMenuItems.find((mi) => mi.name === itemName);
      if (foundItem) {
        const foundCat = adminCategories.find((c) => c.id === foundItem.category_id);
        if (foundCat) matchedCatName = foundCat.name;
      } else if (itemName.includes('Pizza')) {
        matchedCatName = 'Pizza';
      } else if (itemName.includes('Burger')) {
        matchedCatName = 'Burger';
      } else if (itemName.includes('Deal') || order.order_source === 'App') {
        matchedCatName = 'Combo Deals';
      }

      categoryRevenueMap[matchedCatName] = (categoryRevenueMap[matchedCatName] || 0) + lineTotal;
    });
  });

  let topDish = 'No Sales Yet';
  let maxUnits = 0;
  Object.entries(itemUnitsMap).forEach(([name, units]) => {
    if (units > maxUnits) {
      maxUnits = units;
      topDish = `${name} (${units} sold)`;
    }
  });

  let topCategory = 'No Categories Sold Yet';
  let maxCatRevenue = 0;
  Object.entries(categoryRevenueMap).forEach(([catName, rev]) => {
    if (rev > maxCatRevenue) {
      maxCatRevenue = rev;
      topCategory = `${catName} (Rs. ${rev.toLocaleString()})`;
    }
  });

  const categoryRevenueList = Object.entries(categoryRevenueMap).map(([name, revenue]) => {
    const percentage = Math.round((revenue / grossSales) * 100);
    return { name, revenue, percentage: Math.min(percentage, 100) };
  });

  res.json({
    success: true,
    data: {
      topDish,
      topCategory,
      categoryRevenue: categoryRevenueList.length > 0 ? categoryRevenueList : [
        { name: 'Regular Pizza', revenue: grossSales, percentage: 100 }
      ],
      categoryBestSellers: [],
      overallBestSellers: [],
    },
  });
});

router.get('/dashboard/audit-log', (req: Request, res: Response) => {
  res.json({ success: true, data: auditLogs });
});

// ==========================================
// 3. POS TERMINAL MODULE
// ==========================================
router.get('/pos/menu', (req: Request, res: Response) => {
  res.json({ success: true, categories: adminCategories, items: adminMenuItems });
});

router.get('/pos/deals', (req: Request, res: Response) => {
  res.json({ success: true, deals: adminDeals });
});

router.post('/pos/order', (req: Request, res: Response) => {
  const {
    orderType,
    customerName,
    customerPhone,
    deliveryAddress,
    items,
    totalAmount,
  } = req.body;

  const deliveryFee = orderType === 'Delivery' ? (Number(restaurantSettings.delivery_fee) || 150) : 0;

  const newOrder = {
    id: adminOrders.length + 1,
    order_number: `#ORD-${1000 + adminOrders.length + 1}`,
    order_source: 'POS',
    order_type: orderType || 'Dine-In',
    customer_id: null,
    customer_name: customerName || null,
    customer_phone: customerPhone || null,
    delivery_address: deliveryAddress || null,
    subtotal: totalAmount || 1000,
    delivery_fee: deliveryFee,
    total_amount: (totalAmount || 1000) + deliveryFee,
    created_at: new Date().toLocaleString(),
    items: items || [],
  };

  adminOrders.unshift(newOrder);

  auditLogs.unshift({
    id: auditLogs.length + 1,
    actor_name: env.ADMIN_NAME,
    category: 'POS Order',
    action_details: `Placed POS Order ${newOrder.order_number} (${orderType}) for ${customerName || 'Walk-in Guest'} (Rs. ${totalAmount})`,
    ip_device: parseDeviceName(req),
    timestamp: new Date().toLocaleString(),
  });

  res.status(201).json({ success: true, message: 'POS Order placed successfully', order: newOrder });
});

// ==========================================
// 4. ALL ORDERS & HISTORY MODULE
// ==========================================
router.get('/orders', (req: Request, res: Response) => {
  const { search, source, type } = req.query;
  let list = [...adminOrders];

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
});

router.get('/orders/:id', (req: Request, res: Response) => {
  const order = adminOrders.find((o) => o.id === parseInt(req.params.id, 10));
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  res.json({ success: true, data: order });
});

// ==========================================
// 5. MENU CATEGORIES MODULE (WITH SIZES & ADD-ONS)
// ==========================================
router.get('/categories', (req: Request, res: Response) => {
  res.json({ success: true, data: adminCategories });
});

router.post('/categories', (req: Request, res: Response) => {
  const { name, sizes, addOns } = req.body;

  const newCat: CategoryData = {
    id: adminCategories.length + 1,
    name: name || 'New Category',
    is_system_default: false,
    display_order: adminCategories.length + 1,
    is_active: true,
    sizes: Array.isArray(sizes)
      ? sizes
          .filter((s: any) => s.enabled !== false && String(s.size_name || s.sizeName || '').trim())
          .map((s: any, idx: number) => ({
            id: s.id ? Number(s.id) : idx + 1,
            enabled: true,
            size_name: (s.size_name || s.sizeName).trim(),
            base_price: Number(s.base_price || s.price) || 0,
          }))
      : [],
    addOns: Array.isArray(addOns)
      ? addOns
          .filter((a: any) => a.enabled !== false && String(a.add_on_name || a.addonName || a.name || '').trim())
          .map((a: any, idx: number) => ({
            id: a.id ? Number(a.id) : idx + 1,
            enabled: true,
            add_on_name: (a.add_on_name || a.addonName || a.name).trim(),
            price: Number(a.price) || 0,
            size_prices: Array.isArray(a.size_prices || a.sizePrices)
              ? (a.size_prices || a.sizePrices)
                  .filter((sp: any) => sp.enabled !== false)
                  .map((sp: any) => ({
                    enabled: true,
                    size_name: sp.size_name || sp.sizeName,
                    price: Number(sp.price) || 0,
                  }))
              : [],
          }))
      : [],
  };

  adminCategories.push(newCat);
  res.status(201).json({ success: true, message: 'Category created', data: newCat });
});

router.put('/categories/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const cat = adminCategories.find((c) => c.id === id);
  if (!cat) return res.status(404).json({ success: false, message: 'Category not found' });

  if (req.body.name) cat.name = req.body.name;
  if (Array.isArray(req.body.sizes)) {
    cat.sizes = req.body.sizes
      .filter((s: any) => s.enabled !== false && String(s.size_name || s.sizeName || '').trim())
      .map((s: any, idx: number) => ({
        id: s.id ? Number(s.id) : idx + 1,
        enabled: true,
        size_name: (s.size_name || s.sizeName).trim(),
        base_price: Number(s.base_price || s.price) || 0,
      }));
  }
  if (Array.isArray(req.body.addOns)) {
    cat.addOns = req.body.addOns
      .filter((a: any) => a.enabled !== false && String(a.add_on_name || a.addonName || a.name || '').trim())
      .map((a: any, idx: number) => ({
        id: a.id ? Number(a.id) : idx + 1,
        enabled: true,
        add_on_name: (a.add_on_name || a.addonName || a.name).trim(),
        price: Number(a.price) || 0,
        size_prices: Array.isArray(a.size_prices || a.sizePrices)
          ? (a.size_prices || a.sizePrices)
              .filter((sp: any) => sp.enabled !== false)
              .map((sp: any) => ({
                enabled: true,
                size_name: sp.size_name || sp.sizeName,
                price: Number(sp.price) || 0,
              }))
          : [],
      }));
  }
  if (req.body.is_active !== undefined) cat.is_active = Boolean(req.body.is_active);

  res.json({ success: true, message: 'Category updated', data: cat });
});

router.delete('/categories/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const index = adminCategories.findIndex((c) => c.id === id);
  if (index < 0) return res.status(404).json({ success: false, message: 'Category not found' });

  if (adminCategories[index].is_system_default) {
    return res.status(400).json({ success: false, message: 'Cannot delete default category' });
  }

  adminCategories.splice(index, 1);
  res.json({ success: true, message: 'Category deleted successfully' });
});

// ==========================================
// 6. MENU ITEMS MODULE (WITH CHECKBOX SIZES & ADD-ONS)
// ==========================================
router.get('/menu', (req: Request, res: Response) => {
  res.json({ success: true, data: adminMenuItems });
});

router.post('/menu', (req: Request, res: Response) => {
  const newItem: MenuItemData = {
    id: adminMenuItems.length + 1,
    category_id: parseInt(req.body.category_id, 10) || 1,
    name: req.body.name || 'New Item',
    description: req.body.description || '',
    image_url: req.body.image_url || '',
    has_variants: req.body.has_variants !== undefined ? Boolean(req.body.has_variants) : true,
    single_price: req.body.single_price !== undefined && req.body.single_price !== null ? Number(req.body.single_price) : null,
    sizes: Array.isArray(req.body.sizes)
      ? req.body.sizes.map((s: any, idx: number) => ({
          id: s.id ? Number(s.id) : idx + 1,
          size_name: s.size_name || s.sizeName || 'Standard',
          price: Number(s.price || s.base_price) || 0,
        }))
      : [],
    addons: Array.isArray(req.body.addons)
      ? req.body.addons.map((a: any, idx: number) => ({
          id: a.id ? Number(a.id) : idx + 1,
          addon_name: a.addon_name || a.add_on_name || a.addonName || 'Add-on',
          price: Number(a.price) || 0,
          size_prices: Array.isArray(a.size_prices || a.sizePrices)
            ? (a.size_prices || a.sizePrices)
                .filter((sp: any) => sp.enabled !== false)
                .map((sp: any) => ({
                  enabled: true,
                  size_name: sp.size_name || sp.sizeName,
                  price: Number(sp.price) || 0,
                }))
            : [],
        }))
      : [],
    is_active: true,
  };

  adminMenuItems.push(newItem);
  res.status(201).json({ success: true, message: 'Menu item created', data: newItem });
});

router.put('/menu/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const item = adminMenuItems.find((m) => m.id === id);
  if (!item) return res.status(404).json({ success: false, message: 'Menu item not found' });

  if (req.body.image_url && req.body.image_url !== item.image_url) {
    deleteOldUploadFile(item.image_url);
    item.image_url = req.body.image_url;
  }

  if (req.body.name) item.name = req.body.name;
  if (req.body.category_id) item.category_id = parseInt(req.body.category_id, 10);
  if (req.body.description !== undefined) item.description = req.body.description;
  if (req.body.has_variants !== undefined) item.has_variants = Boolean(req.body.has_variants);
  if (req.body.single_price !== undefined) item.single_price = req.body.single_price !== null ? Number(req.body.single_price) : null;
  if (Array.isArray(req.body.sizes)) {
    item.sizes = req.body.sizes.map((s: any, idx: number) => ({
      id: s.id ? Number(s.id) : idx + 1,
      size_name: s.size_name || s.sizeName || 'Standard',
      price: Number(s.price || s.base_price) || 0,
    }));
  }
  if (Array.isArray(req.body.addons)) {
    item.addons = req.body.addons.map((a: any, idx: number) => ({
      id: a.id ? Number(a.id) : idx + 1,
      addon_name: a.addon_name || a.add_on_name || a.addonName || 'Add-on',
      price: Number(a.price) || 0,
      size_prices: Array.isArray(a.size_prices || a.sizePrices)
        ? (a.size_prices || a.sizePrices)
            .filter((sp: any) => sp.enabled !== false)
            .map((sp: any) => ({
              enabled: true,
              size_name: sp.size_name || sp.sizeName,
              price: Number(sp.price) || 0,
            }))
        : [],
    }));
  }

  res.json({ success: true, message: 'Menu item updated', data: item });
});

router.post('/menu/:id/toggle', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const item = adminMenuItems.find((m) => m.id === id);
  if (!item) return res.status(404).json({ success: false, message: 'Menu item not found' });

  item.is_active = !item.is_active;
  res.json({ success: true, message: `Menu item ${item.is_active ? 'enabled' : 'disabled'}`, data: item });
});

router.delete('/menu/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const index = adminMenuItems.findIndex((m) => m.id === id);
  if (index < 0) return res.status(404).json({ success: false, message: 'Menu item not found' });

  deleteOldUploadFile(adminMenuItems[index].image_url);
  adminMenuItems.splice(index, 1);
  res.json({ success: true, message: 'Menu item deleted' });
});

// --- Combo Deals ---
router.get('/deals', (req: Request, res: Response) => {
  res.json({ success: true, data: adminDeals });
});

router.post('/deals', (req: Request, res: Response) => {
  let includedItems = [];
  try {
    includedItems = typeof req.body.included_items_json === 'string'
      ? JSON.parse(req.body.included_items_json)
      : req.body.included_items_json || [];
  } catch {
    includedItems = [];
  }

  const newDeal = {
    id: adminDeals.length + 1,
    name: req.body.name || 'New Combo Deal',
    description: req.body.description || '',
    package_price: Number(req.body.package_price) || 0,
    priority_order: Number(req.body.priority_order) || 1,
    included_items_json: includedItems,
    image_url: req.body.image_url || '',
    is_time_limited: Boolean(req.body.is_time_limited),
    valid_from: req.body.valid_from || null,
    valid_to: req.body.valid_to || null,
    is_active: true,
  };

  adminDeals.push(newDeal);
  res.status(201).json({ success: true, message: 'Combo deal created', data: newDeal });
});

router.put('/deals/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const deal = adminDeals.find((d) => d.id === id);
  if (!deal) return res.status(404).json({ success: false, message: 'Deal not found' });

  if (req.body.image_url && req.body.image_url !== deal.image_url) {
    deleteOldUploadFile(deal.image_url);
    deal.image_url = req.body.image_url;
  }

  if (req.body.name) deal.name = req.body.name;
  if (req.body.description !== undefined) deal.description = req.body.description;
  if (req.body.package_price !== undefined) deal.package_price = Number(req.body.package_price);
  if (req.body.priority_order !== undefined) deal.priority_order = Number(req.body.priority_order);
  if (req.body.is_time_limited !== undefined) deal.is_time_limited = Boolean(req.body.is_time_limited);
  if (req.body.valid_from !== undefined) deal.valid_from = req.body.valid_from;
  if (req.body.valid_to !== undefined) deal.valid_to = req.body.valid_to;

  res.json({ success: true, message: 'Combo deal updated', data: deal });
});

router.post('/deals/:id/toggle', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const deal = adminDeals.find((d) => d.id === id);
  if (!deal) return res.status(404).json({ success: false, message: 'Deal not found' });

  deal.is_active = !deal.is_active;
  res.json({ success: true, message: `Deal ${deal.is_active ? 'enabled' : 'disabled'}`, data: deal });
});

router.delete('/deals/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const index = adminDeals.findIndex((d) => d.id === id);
  if (index < 0) return res.status(404).json({ success: false, message: 'Deal not found' });

  deleteOldUploadFile(adminDeals[index].image_url);
  adminDeals.splice(index, 1);
  res.json({ success: true, message: 'Combo deal deleted' });
});

// ==========================================
// 7. EMPLOYEES MANAGEMENT MODULE
// ==========================================
router.get('/employees', (req: Request, res: Response) => {
  res.json({ success: true, data: adminEmployees });
});

router.post('/employees', (req: Request, res: Response) => {
  const newEmp = {
    id: adminEmployees.length + 1,
    full_name: req.body.full_name || 'New Staff Member',
    phone_number: req.body.phone_number || '',
    address: req.body.address || '',
    position: req.body.position || 'Chef',
    join_date: req.body.join_date || new Date().toISOString().split('T')[0],
  };

  adminEmployees.push(newEmp);
  res.status(201).json({ success: true, message: 'Employee created', data: newEmp });
});

router.put('/employees/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const emp = adminEmployees.find((e) => e.id === id);
  if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });

  if (req.body.full_name) emp.full_name = req.body.full_name;
  if (req.body.phone_number) emp.phone_number = req.body.phone_number;
  if (req.body.address !== undefined) emp.address = req.body.address;
  if (req.body.position) emp.position = req.body.position;

  res.json({ success: true, message: 'Employee updated', data: emp });
});

router.delete('/employees/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const index = adminEmployees.findIndex((e) => e.id === id);
  if (index < 0) return res.status(404).json({ success: false, message: 'Employee not found' });

  adminEmployees.splice(index, 1);
  res.json({ success: true, message: 'Employee deleted' });
});

// ==========================================
// 8. CUSTOMER MANAGEMENT MODULE (DYNAMIC TOTAL ORDERS CALCULATION)
// ==========================================
router.get('/customers', (req: Request, res: Response) => {
  const calculatedCustomers = adminCustomers.map((c) => {
    const matchedOrders = adminOrders.filter((o) => {
      if (!o.customer_phone || !c.phone_number) return false;
      const cleanOrderPhone = String(o.customer_phone).replaceAll(/\D/g, '');
      const cleanCustPhone = String(c.phone_number).replaceAll(/\D/g, '');
      return (
        cleanOrderPhone === cleanCustPhone ||
        (cleanOrderPhone.length >= 7 &&
          cleanCustPhone.length >= 7 &&
          (cleanOrderPhone.includes(cleanCustPhone) ||
            cleanCustPhone.includes(cleanOrderPhone)))
      );
    });

    return {
      ...c,
      total_orders: matchedOrders.length,
    };
  });

  res.json({ success: true, data: calculatedCustomers });
});

router.post('/customers', (req: Request, res: Response) => {
  const newCust = {
    id: adminCustomers.length + 1,
    name: req.body.name || 'New Customer',
    phone_number: req.body.phone_number || '',
    detailed_address: req.body.detailed_address || '',
    is_blocked: Boolean(req.body.is_blocked),
    total_orders: 0,
  };

  adminCustomers.push(newCust);
  res.status(201).json({ success: true, message: 'Customer record created', data: newCust });
});

router.put('/customers/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const cust = adminCustomers.find((c) => c.id === id);
  if (!cust) return res.status(404).json({ success: false, message: 'Customer not found' });

  if (req.body.name) cust.name = req.body.name;
  if (req.body.phone_number) cust.phone_number = req.body.phone_number;
  if (req.body.detailed_address !== undefined) cust.detailed_address = req.body.detailed_address;
  if (req.body.is_blocked !== undefined) cust.is_blocked = Boolean(req.body.is_blocked);

  res.json({ success: true, message: 'Customer record updated', data: cust });
});

router.delete('/customers/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const index = adminCustomers.findIndex((c) => c.id === id);
  if (index < 0) return res.status(404).json({ success: false, message: 'Customer not found' });

  adminCustomers.splice(index, 1);
  res.json({ success: true, message: 'Customer record deleted' });
});

router.post('/customers/:id/toggle-block', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const cust = adminCustomers.find((c) => c.id === id);
  if (!cust) return res.status(404).json({ success: false, message: 'Customer not found' });

  cust.is_blocked = !cust.is_blocked;
  res.json({ success: true, message: `Customer ${cust.is_blocked ? 'blocked' : 'unblocked'}`, data: cust });
});

// ==========================================
// 9. RESTAURANT & APP MANAGEMENT SETTINGS
// ==========================================
router.get('/restaurant/settings', (req: Request, res: Response) => {
  res.json({ success: true, data: restaurantSettings });
});

router.post('/restaurant/settings', (req: Request, res: Response) => {
  Object.assign(restaurantSettings, req.body);
  res.json({ success: true, message: 'Restaurant settings updated', data: restaurantSettings });
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
