"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_js_1 = require("../../config/config.js");
const adminAuthGuard_js_1 = require("../../middleware/adminAuthGuard.js");
const uploadService_js_1 = require("../../services/uploadService.js");
const deviceService_js_1 = require("../../services/deviceService.js");
const adminStore_js_1 = require("./adminStore.js");
const router = (0, express_1.Router)();
// Helper to delete previous uploaded file from disk if replaced
function deleteOldUploadFile(imageUrl) {
    if (!imageUrl)
        return;
    try {
        const filename = imageUrl.split('/uploads/').pop();
        if (filename && !filename.startsWith('http')) {
            const filePath = path_1.default.resolve(process.cwd(), 'uploads', filename);
            if (fs_1.default.existsSync(filePath)) {
                fs_1.default.unlinkSync(filePath);
            }
        }
    }
    catch (err) {
        console.warn('[Storage] Failed to delete old upload file:', err);
    }
}
// ==========================================
// 1. AUTHENTICATION & DEVICE SECURITY MODULE
// ==========================================
router.post('/auth/sign-in', async (req, res) => {
    const { email, password, deviceId } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password required' });
    }
    // Validate credentials against .env environment variables
    if (email.trim().toLowerCase() === config_js_1.env.ADMIN_EMAIL.toLowerCase() &&
        password === config_js_1.env.ADMIN_PASSWORD) {
        const realDeviceName = (0, deviceService_js_1.parseDeviceName)(req);
        const clientIp = req.headers['x-forwarded-for'] || req.ip || '127.0.0.1';
        const clientDeviceId = deviceId || 'dev_primary_001';
        let device = adminStore_js_1.authorizedDevices.find((d) => d.device_id === clientDeviceId);
        // Auto approve first registered primary device
        if (adminStore_js_1.authorizedDevices.length === 0) {
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
            adminStore_js_1.authorizedDevices.push(device);
        }
        else if (!device) {
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
            adminStore_js_1.authorizedDevices.push(device);
            adminStore_js_1.auditLogs.unshift({
                id: adminStore_js_1.auditLogs.length + 1,
                actor_name: config_js_1.env.ADMIN_NAME,
                category: 'Device Security',
                action_details: `New device login request pending authorization: ${realDeviceName}`,
                ip_device: `${realDeviceName} (${clientIp})`,
                timestamp: new Date().toLocaleString(),
            });
        }
        else {
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
            name: config_js_1.env.ADMIN_NAME,
            email: config_js_1.env.ADMIN_EMAIL,
            role: config_js_1.env.ADMIN_ROLE,
        };
        const token = jsonwebtoken_1.default.sign(adminUser, config_js_1.env.ADMIN_JWT_SECRET, { expiresIn: '7d' });
        adminStore_js_1.auditLogs.unshift({
            id: adminStore_js_1.auditLogs.length + 1,
            actor_name: config_js_1.env.ADMIN_NAME,
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
router.post('/auth/sign-out', (req, res) => {
    const realDeviceName = (0, deviceService_js_1.parseDeviceName)(req);
    const clientIp = req.headers['x-forwarded-for'] || req.ip || '127.0.0.1';
    adminStore_js_1.auditLogs.unshift({
        id: adminStore_js_1.auditLogs.length + 1,
        actor_name: config_js_1.env.ADMIN_NAME,
        category: 'Authentication',
        action_details: `Admin signed out from ${realDeviceName}`,
        ip_device: `${realDeviceName} (${clientIp})`,
        timestamp: new Date().toLocaleString(),
    });
    res.json({ success: true, message: 'Signed out successfully' });
});
// Device Security Endpoints
router.get('/devices', (req, res) => {
    res.json({ success: true, data: adminStore_js_1.authorizedDevices });
});
router.post('/devices/:id/approve', (req, res) => {
    const dev = adminStore_js_1.authorizedDevices.find((d) => d.id === req.params.id || d.device_id === req.params.id);
    if (!dev)
        return res.status(404).json({ success: false, message: 'Device not found' });
    dev.status = 'approved';
    dev.approved_at = new Date().toLocaleString();
    adminStore_js_1.auditLogs.unshift({
        id: adminStore_js_1.auditLogs.length + 1,
        actor_name: config_js_1.env.ADMIN_NAME,
        category: 'Device Security',
        action_details: `Approved device: ${dev.device_name} (${dev.ip_address})`,
        ip_device: (0, deviceService_js_1.parseDeviceName)(req),
        timestamp: new Date().toLocaleString(),
    });
    res.json({ success: true, message: 'Device approved successfully', data: dev });
});
router.post('/devices/:id/block', (req, res) => {
    const dev = adminStore_js_1.authorizedDevices.find((d) => d.id === req.params.id || d.device_id === req.params.id);
    if (!dev)
        return res.status(404).json({ success: false, message: 'Device not found' });
    dev.status = 'blocked';
    adminStore_js_1.auditLogs.unshift({
        id: adminStore_js_1.auditLogs.length + 1,
        actor_name: config_js_1.env.ADMIN_NAME,
        category: 'Device Security',
        action_details: `Blocked device: ${dev.device_name} (${dev.ip_address})`,
        ip_device: (0, deviceService_js_1.parseDeviceName)(req),
        timestamp: new Date().toLocaleString(),
    });
    res.json({ success: true, message: 'Device blocked successfully', data: dev });
});
router.post('/devices/:id/unblock', (req, res) => {
    const dev = adminStore_js_1.authorizedDevices.find((d) => d.id === req.params.id || d.device_id === req.params.id);
    if (!dev)
        return res.status(404).json({ success: false, message: 'Device not found' });
    dev.status = 'approved';
    adminStore_js_1.auditLogs.unshift({
        id: adminStore_js_1.auditLogs.length + 1,
        actor_name: config_js_1.env.ADMIN_NAME,
        category: 'Device Security',
        action_details: `Unblocked device: ${dev.device_name} (${dev.ip_address})`,
        ip_device: (0, deviceService_js_1.parseDeviceName)(req),
        timestamp: new Date().toLocaleString(),
    });
    res.json({ success: true, message: 'Device unblocked successfully', data: dev });
});
// Protected Admin Routes Below
router.use(adminAuthGuard_js_1.adminAuthGuard);
// ==========================================
// 2. DASHBOARD MODULE (DYNAMIC REAL METRICS)
// ==========================================
router.get('/dashboard/sales-digest', (req, res) => {
    const totalOrders = adminStore_js_1.adminOrders.length;
    const grossSales = adminStore_js_1.adminOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const dineInOrders = adminStore_js_1.adminOrders.filter((o) => o.order_type === 'Dine-In').length;
    const takeawayOrders = adminStore_js_1.adminOrders.filter((o) => o.order_type === 'Takeaway').length;
    const deliveryOrders = adminStore_js_1.adminOrders.filter((o) => o.order_type === 'Delivery').length;
    const averageOrderValue = totalOrders > 0 ? Math.round(grossSales / totalOrders) : 0;
    // Calculate Peak Busy Hours dynamically
    let peakBusyHours = 'No Orders Yet';
    if (totalOrders > 0) {
        const hourCounts = {};
        adminStore_js_1.adminOrders.forEach((o) => {
            const timeStr = o.created_at || '';
            const match = timeStr.match(/(\d+):/);
            const isPm = timeStr.includes('PM');
            if (match) {
                let hourNum = parseInt(match[1], 10);
                if (isPm && hourNum < 12)
                    hourNum += 12;
                if (!isPm && hourNum === 12)
                    hourNum = 0;
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
            rows: adminStore_js_1.adminOrders.map((o) => ({
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
router.get('/dashboard/item-category-sales', (req, res) => {
    const totalOrders = adminStore_js_1.adminOrders.length;
    const grossSales = adminStore_js_1.adminOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
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
    const itemUnitsMap = {};
    const categoryRevenueMap = {};
    adminStore_js_1.adminOrders.forEach((order) => {
        (order.items || []).forEach((line) => {
            const itemName = line.itemName || line.name || 'Dish Item';
            const qty = Number(line.quantity) || 1;
            const lineTotal = Number(line.totalPrice) || (Number(line.unit_price || line.sizePrice || 0) * qty);
            itemUnitsMap[itemName] = (itemUnitsMap[itemName] || 0) + qty;
            let matchedCatName = 'General Menu';
            const foundItem = adminStore_js_1.adminMenuItems.find((mi) => mi.name === itemName);
            if (foundItem) {
                const foundCat = adminStore_js_1.adminCategories.find((c) => c.id === foundItem.category_id);
                if (foundCat)
                    matchedCatName = foundCat.name;
            }
            else if (itemName.includes('Pizza')) {
                matchedCatName = 'Pizza';
            }
            else if (itemName.includes('Burger')) {
                matchedCatName = 'Burger';
            }
            else if (itemName.includes('Deal') || order.order_source === 'App') {
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
router.get('/dashboard/audit-log', (req, res) => {
    res.json({ success: true, data: adminStore_js_1.auditLogs });
});
// ==========================================
// 3. POS TERMINAL MODULE
// ==========================================
router.get('/pos/menu', (req, res) => {
    res.json({ success: true, categories: adminStore_js_1.adminCategories, items: adminStore_js_1.adminMenuItems });
});
router.get('/pos/deals', (req, res) => {
    res.json({ success: true, deals: adminStore_js_1.adminDeals });
});
router.post('/pos/order', (req, res) => {
    const { orderType, customerName, customerPhone, deliveryAddress, items, totalAmount, } = req.body;
    const deliveryFee = orderType === 'Delivery' ? (Number(adminStore_js_1.restaurantSettings.delivery_fee) || 150) : 0;
    const newOrder = {
        id: adminStore_js_1.adminOrders.length + 1,
        order_number: `#ORD-${1000 + adminStore_js_1.adminOrders.length + 1}`,
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
    adminStore_js_1.adminOrders.unshift(newOrder);
    adminStore_js_1.auditLogs.unshift({
        id: adminStore_js_1.auditLogs.length + 1,
        actor_name: config_js_1.env.ADMIN_NAME,
        category: 'POS Order',
        action_details: `Placed POS Order ${newOrder.order_number} (${orderType}) for ${customerName || 'Walk-in Guest'} (Rs. ${totalAmount})`,
        ip_device: (0, deviceService_js_1.parseDeviceName)(req),
        timestamp: new Date().toLocaleString(),
    });
    res.status(201).json({ success: true, message: 'POS Order placed successfully', order: newOrder });
});
// ==========================================
// 4. ALL ORDERS & HISTORY MODULE
// ==========================================
router.get('/orders', (req, res) => {
    const { search, source, type } = req.query;
    let list = [...adminStore_js_1.adminOrders];
    if (source && source !== 'all') {
        list = list.filter((o) => o.order_source.toLowerCase() === source.toLowerCase());
    }
    if (type && type !== 'all') {
        list = list.filter((o) => o.order_type.toLowerCase() === type.toLowerCase());
    }
    if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        list = list.filter((o) => o.order_number.toLowerCase().includes(q) ||
            (o.customer_name && o.customer_name.toLowerCase().includes(q)) ||
            (o.customer_phone && o.customer_phone.toLowerCase().includes(q)));
    }
    res.json({ success: true, data: list });
});
router.get('/orders/:id', (req, res) => {
    const order = adminStore_js_1.adminOrders.find((o) => o.id === parseInt(req.params.id, 10));
    if (!order)
        return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, data: order });
});
// ==========================================
// 5. MENU CATEGORIES MODULE (WITH SIZES & ADD-ONS)
// ==========================================
router.get('/categories', (req, res) => {
    res.json({ success: true, data: adminStore_js_1.adminCategories });
});
router.post('/categories', (req, res) => {
    const { name, sizes, addOns } = req.body;
    const newCat = {
        id: adminStore_js_1.adminCategories.length + 1,
        name: name || 'New Category',
        is_system_default: false,
        display_order: adminStore_js_1.adminCategories.length + 1,
        is_active: true,
        sizes: Array.isArray(sizes)
            ? sizes
                .filter((s) => s.enabled !== false && String(s.size_name || s.sizeName || '').trim())
                .map((s, idx) => ({
                id: s.id ? Number(s.id) : idx + 1,
                enabled: true,
                size_name: (s.size_name || s.sizeName).trim(),
                base_price: Number(s.base_price || s.price) || 0,
            }))
            : [],
        addOns: Array.isArray(addOns)
            ? addOns
                .filter((a) => a.enabled !== false && String(a.add_on_name || a.addonName || a.name || '').trim())
                .map((a, idx) => ({
                id: a.id ? Number(a.id) : idx + 1,
                enabled: true,
                add_on_name: (a.add_on_name || a.addonName || a.name).trim(),
                price: Number(a.price) || 0,
                size_prices: Array.isArray(a.size_prices || a.sizePrices)
                    ? (a.size_prices || a.sizePrices)
                        .filter((sp) => sp.enabled !== false)
                        .map((sp) => ({
                        enabled: true,
                        size_name: sp.size_name || sp.sizeName,
                        price: Number(sp.price) || 0,
                    }))
                    : [],
            }))
            : [],
    };
    adminStore_js_1.adminCategories.push(newCat);
    res.status(201).json({ success: true, message: 'Category created', data: newCat });
});
router.put('/categories/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const cat = adminStore_js_1.adminCategories.find((c) => c.id === id);
    if (!cat)
        return res.status(404).json({ success: false, message: 'Category not found' });
    if (req.body.name)
        cat.name = req.body.name;
    if (Array.isArray(req.body.sizes)) {
        cat.sizes = req.body.sizes
            .filter((s) => s.enabled !== false && String(s.size_name || s.sizeName || '').trim())
            .map((s, idx) => ({
            id: s.id ? Number(s.id) : idx + 1,
            enabled: true,
            size_name: (s.size_name || s.sizeName).trim(),
            base_price: Number(s.base_price || s.price) || 0,
        }));
    }
    if (Array.isArray(req.body.addOns)) {
        cat.addOns = req.body.addOns
            .filter((a) => a.enabled !== false && String(a.add_on_name || a.addonName || a.name || '').trim())
            .map((a, idx) => ({
            id: a.id ? Number(a.id) : idx + 1,
            enabled: true,
            add_on_name: (a.add_on_name || a.addonName || a.name).trim(),
            price: Number(a.price) || 0,
            size_prices: Array.isArray(a.size_prices || a.sizePrices)
                ? (a.size_prices || a.sizePrices)
                    .filter((sp) => sp.enabled !== false)
                    .map((sp) => ({
                    enabled: true,
                    size_name: sp.size_name || sp.sizeName,
                    price: Number(sp.price) || 0,
                }))
                : [],
        }));
    }
    if (req.body.is_active !== undefined)
        cat.is_active = Boolean(req.body.is_active);
    res.json({ success: true, message: 'Category updated', data: cat });
});
router.delete('/categories/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const index = adminStore_js_1.adminCategories.findIndex((c) => c.id === id);
    if (index < 0)
        return res.status(404).json({ success: false, message: 'Category not found' });
    if (adminStore_js_1.adminCategories[index].is_system_default) {
        return res.status(400).json({ success: false, message: 'Cannot delete default category' });
    }
    adminStore_js_1.adminCategories.splice(index, 1);
    res.json({ success: true, message: 'Category deleted successfully' });
});
// ==========================================
// 6. MENU ITEMS MODULE (WITH CHECKBOX SIZES & ADD-ONS)
// ==========================================
router.get('/menu', (req, res) => {
    res.json({ success: true, data: adminStore_js_1.adminMenuItems });
});
router.post('/menu', (req, res) => {
    const newItem = {
        id: adminStore_js_1.adminMenuItems.length + 1,
        category_id: parseInt(req.body.category_id, 10) || 1,
        name: req.body.name || 'New Item',
        description: req.body.description || '',
        image_url: req.body.image_url || '',
        has_variants: req.body.has_variants !== undefined ? Boolean(req.body.has_variants) : true,
        single_price: req.body.single_price !== undefined && req.body.single_price !== null ? Number(req.body.single_price) : null,
        sizes: Array.isArray(req.body.sizes)
            ? req.body.sizes.map((s, idx) => ({
                id: s.id ? Number(s.id) : idx + 1,
                size_name: s.size_name || s.sizeName || 'Standard',
                price: Number(s.price || s.base_price) || 0,
            }))
            : [],
        addons: Array.isArray(req.body.addons)
            ? req.body.addons.map((a, idx) => ({
                id: a.id ? Number(a.id) : idx + 1,
                addon_name: a.addon_name || a.add_on_name || a.addonName || 'Add-on',
                price: Number(a.price) || 0,
                size_prices: Array.isArray(a.size_prices || a.sizePrices)
                    ? (a.size_prices || a.sizePrices)
                        .filter((sp) => sp.enabled !== false)
                        .map((sp) => ({
                        enabled: true,
                        size_name: sp.size_name || sp.sizeName,
                        price: Number(sp.price) || 0,
                    }))
                    : [],
            }))
            : [],
        is_active: true,
    };
    adminStore_js_1.adminMenuItems.push(newItem);
    res.status(201).json({ success: true, message: 'Menu item created', data: newItem });
});
router.put('/menu/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const item = adminStore_js_1.adminMenuItems.find((m) => m.id === id);
    if (!item)
        return res.status(404).json({ success: false, message: 'Menu item not found' });
    if (req.body.image_url && req.body.image_url !== item.image_url) {
        deleteOldUploadFile(item.image_url);
        item.image_url = req.body.image_url;
    }
    if (req.body.name)
        item.name = req.body.name;
    if (req.body.category_id)
        item.category_id = parseInt(req.body.category_id, 10);
    if (req.body.description !== undefined)
        item.description = req.body.description;
    if (req.body.has_variants !== undefined)
        item.has_variants = Boolean(req.body.has_variants);
    if (req.body.single_price !== undefined)
        item.single_price = req.body.single_price !== null ? Number(req.body.single_price) : null;
    if (Array.isArray(req.body.sizes)) {
        item.sizes = req.body.sizes.map((s, idx) => ({
            id: s.id ? Number(s.id) : idx + 1,
            size_name: s.size_name || s.sizeName || 'Standard',
            price: Number(s.price || s.base_price) || 0,
        }));
    }
    if (Array.isArray(req.body.addons)) {
        item.addons = req.body.addons.map((a, idx) => ({
            id: a.id ? Number(a.id) : idx + 1,
            addon_name: a.addon_name || a.add_on_name || a.addonName || 'Add-on',
            price: Number(a.price) || 0,
            size_prices: Array.isArray(a.size_prices || a.sizePrices)
                ? (a.size_prices || a.sizePrices)
                    .filter((sp) => sp.enabled !== false)
                    .map((sp) => ({
                    enabled: true,
                    size_name: sp.size_name || sp.sizeName,
                    price: Number(sp.price) || 0,
                }))
                : [],
        }));
    }
    res.json({ success: true, message: 'Menu item updated', data: item });
});
router.post('/menu/:id/toggle', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const item = adminStore_js_1.adminMenuItems.find((m) => m.id === id);
    if (!item)
        return res.status(404).json({ success: false, message: 'Menu item not found' });
    item.is_active = !item.is_active;
    res.json({ success: true, message: `Menu item ${item.is_active ? 'enabled' : 'disabled'}`, data: item });
});
router.delete('/menu/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const index = adminStore_js_1.adminMenuItems.findIndex((m) => m.id === id);
    if (index < 0)
        return res.status(404).json({ success: false, message: 'Menu item not found' });
    deleteOldUploadFile(adminStore_js_1.adminMenuItems[index].image_url);
    adminStore_js_1.adminMenuItems.splice(index, 1);
    res.json({ success: true, message: 'Menu item deleted' });
});
// --- Combo Deals ---
router.get('/deals', (req, res) => {
    res.json({ success: true, data: adminStore_js_1.adminDeals });
});
router.post('/deals', (req, res) => {
    let includedItems = [];
    try {
        includedItems = typeof req.body.included_items_json === 'string'
            ? JSON.parse(req.body.included_items_json)
            : req.body.included_items_json || [];
    }
    catch {
        includedItems = [];
    }
    const newDeal = {
        id: adminStore_js_1.adminDeals.length + 1,
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
    adminStore_js_1.adminDeals.push(newDeal);
    res.status(201).json({ success: true, message: 'Combo deal created', data: newDeal });
});
router.put('/deals/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const deal = adminStore_js_1.adminDeals.find((d) => d.id === id);
    if (!deal)
        return res.status(404).json({ success: false, message: 'Deal not found' });
    if (req.body.image_url && req.body.image_url !== deal.image_url) {
        deleteOldUploadFile(deal.image_url);
        deal.image_url = req.body.image_url;
    }
    if (req.body.name)
        deal.name = req.body.name;
    if (req.body.description !== undefined)
        deal.description = req.body.description;
    if (req.body.package_price !== undefined)
        deal.package_price = Number(req.body.package_price);
    if (req.body.priority_order !== undefined)
        deal.priority_order = Number(req.body.priority_order);
    if (req.body.is_time_limited !== undefined)
        deal.is_time_limited = Boolean(req.body.is_time_limited);
    if (req.body.valid_from !== undefined)
        deal.valid_from = req.body.valid_from;
    if (req.body.valid_to !== undefined)
        deal.valid_to = req.body.valid_to;
    res.json({ success: true, message: 'Combo deal updated', data: deal });
});
router.post('/deals/:id/toggle', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const deal = adminStore_js_1.adminDeals.find((d) => d.id === id);
    if (!deal)
        return res.status(404).json({ success: false, message: 'Deal not found' });
    deal.is_active = !deal.is_active;
    res.json({ success: true, message: `Deal ${deal.is_active ? 'enabled' : 'disabled'}`, data: deal });
});
router.delete('/deals/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const index = adminStore_js_1.adminDeals.findIndex((d) => d.id === id);
    if (index < 0)
        return res.status(404).json({ success: false, message: 'Deal not found' });
    deleteOldUploadFile(adminStore_js_1.adminDeals[index].image_url);
    adminStore_js_1.adminDeals.splice(index, 1);
    res.json({ success: true, message: 'Combo deal deleted' });
});
// ==========================================
// 7. EMPLOYEES MANAGEMENT MODULE
// ==========================================
router.get('/employees', (req, res) => {
    res.json({ success: true, data: adminStore_js_1.adminEmployees });
});
router.post('/employees', (req, res) => {
    const newEmp = {
        id: adminStore_js_1.adminEmployees.length + 1,
        full_name: req.body.full_name || 'New Staff Member',
        phone_number: req.body.phone_number || '',
        address: req.body.address || '',
        position: req.body.position || 'Chef',
        join_date: req.body.join_date || new Date().toISOString().split('T')[0],
    };
    adminStore_js_1.adminEmployees.push(newEmp);
    res.status(201).json({ success: true, message: 'Employee created', data: newEmp });
});
router.put('/employees/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const emp = adminStore_js_1.adminEmployees.find((e) => e.id === id);
    if (!emp)
        return res.status(404).json({ success: false, message: 'Employee not found' });
    if (req.body.full_name)
        emp.full_name = req.body.full_name;
    if (req.body.phone_number)
        emp.phone_number = req.body.phone_number;
    if (req.body.address !== undefined)
        emp.address = req.body.address;
    if (req.body.position)
        emp.position = req.body.position;
    res.json({ success: true, message: 'Employee updated', data: emp });
});
router.delete('/employees/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const index = adminStore_js_1.adminEmployees.findIndex((e) => e.id === id);
    if (index < 0)
        return res.status(404).json({ success: false, message: 'Employee not found' });
    adminStore_js_1.adminEmployees.splice(index, 1);
    res.json({ success: true, message: 'Employee deleted' });
});
// ==========================================
// 8. CUSTOMER MANAGEMENT MODULE (DYNAMIC TOTAL ORDERS CALCULATION)
// ==========================================
router.get('/customers', (req, res) => {
    const calculatedCustomers = adminStore_js_1.adminCustomers.map((c) => {
        const matchedOrders = adminStore_js_1.adminOrders.filter((o) => {
            if (!o.customer_phone || !c.phone_number)
                return false;
            const cleanOrderPhone = String(o.customer_phone).replaceAll(/\D/g, '');
            const cleanCustPhone = String(c.phone_number).replaceAll(/\D/g, '');
            return (cleanOrderPhone === cleanCustPhone ||
                (cleanOrderPhone.length >= 7 &&
                    cleanCustPhone.length >= 7 &&
                    (cleanOrderPhone.includes(cleanCustPhone) ||
                        cleanCustPhone.includes(cleanOrderPhone))));
        });
        return {
            ...c,
            total_orders: matchedOrders.length,
        };
    });
    res.json({ success: true, data: calculatedCustomers });
});
router.post('/customers', (req, res) => {
    const newCust = {
        id: adminStore_js_1.adminCustomers.length + 1,
        name: req.body.name || 'New Customer',
        phone_number: req.body.phone_number || '',
        detailed_address: req.body.detailed_address || '',
        is_blocked: Boolean(req.body.is_blocked),
        total_orders: 0,
    };
    adminStore_js_1.adminCustomers.push(newCust);
    res.status(201).json({ success: true, message: 'Customer record created', data: newCust });
});
router.put('/customers/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const cust = adminStore_js_1.adminCustomers.find((c) => c.id === id);
    if (!cust)
        return res.status(404).json({ success: false, message: 'Customer not found' });
    if (req.body.name)
        cust.name = req.body.name;
    if (req.body.phone_number)
        cust.phone_number = req.body.phone_number;
    if (req.body.detailed_address !== undefined)
        cust.detailed_address = req.body.detailed_address;
    if (req.body.is_blocked !== undefined)
        cust.is_blocked = Boolean(req.body.is_blocked);
    res.json({ success: true, message: 'Customer record updated', data: cust });
});
router.delete('/customers/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const index = adminStore_js_1.adminCustomers.findIndex((c) => c.id === id);
    if (index < 0)
        return res.status(404).json({ success: false, message: 'Customer not found' });
    adminStore_js_1.adminCustomers.splice(index, 1);
    res.json({ success: true, message: 'Customer record deleted' });
});
router.post('/customers/:id/toggle-block', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const cust = adminStore_js_1.adminCustomers.find((c) => c.id === id);
    if (!cust)
        return res.status(404).json({ success: false, message: 'Customer not found' });
    cust.is_blocked = !cust.is_blocked;
    res.json({ success: true, message: `Customer ${cust.is_blocked ? 'blocked' : 'unblocked'}`, data: cust });
});
// ==========================================
// 9. RESTAURANT & APP MANAGEMENT SETTINGS
// ==========================================
router.get('/restaurant/settings', (req, res) => {
    res.json({ success: true, data: adminStore_js_1.restaurantSettings });
});
router.post('/restaurant/settings', (req, res) => {
    Object.assign(adminStore_js_1.restaurantSettings, req.body);
    res.json({ success: true, message: 'Restaurant settings updated', data: adminStore_js_1.restaurantSettings });
});
// ==========================================
// 10. PROFILE & MEDIA UPLOAD MODULE
// ==========================================
router.get('/profile', (req, res) => {
    res.json({ success: true, data: req.admin });
});
router.post('/upload', uploadService_js_1.uploadMiddleware.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const imageUrl = (0, uploadService_js_1.getImageUrl)(req.file.filename);
    res.json({
        success: true,
        message: 'File uploaded successfully',
        filename: req.file.filename,
        imageUrl,
    });
});
exports.default = router;
