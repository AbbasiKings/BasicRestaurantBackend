"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_js_1 = require("../../config/config.js");
const db_js_1 = require("../../config/db.js");
const strings_js_1 = require("../../constants/strings.js");
const values_js_1 = require("../../constants/values.js");
const enums_js_1 = require("../../types/enums.js");
const adminAuthGuard_js_1 = require("../../middleware/adminAuthGuard.js");
const uploadService_js_1 = require("../../services/uploadService.js");
const deviceService_js_1 = require("../../services/deviceService.js");
const dbStore_js_1 = require("../../services/dbStore.js");
const router = (0, express_1.Router)();
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
router.post('/auth/sign-in', async (req, res, next) => {
    try {
        const { email, password, deviceId } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: strings_js_1.STRINGS.EMAIL_PASSWORD_REQUIRED });
        }
        const cleanEmail = String(email).trim().toLowerCase();
        const adminRes = await (0, db_js_1.query)(`SELECT * FROM admins WHERE LOWER(email) = $1;`, [cleanEmail]);
        if (adminRes.rows.length === 0) {
            return res.status(401).json({ success: false, message: strings_js_1.STRINGS.INVALID_ADMIN_CREDENTIALS });
        }
        const admin = adminRes.rows[0];
        const isPasswordValid = await bcryptjs_1.default.compare(String(password), admin.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({ success: false, message: strings_js_1.STRINGS.INVALID_ADMIN_CREDENTIALS });
        }
        const realDeviceName = (0, deviceService_js_1.parseDeviceName)(req);
        const clientIp = req.headers['x-forwarded-for'] || req.ip || '127.0.0.1';
        const clientDeviceId = deviceId || 'dev_primary_001';
        const allDevices = await (0, dbStore_js_1.getAuthorizedDevicesFromDB)();
        let device = allDevices.find((d) => d.device_id === clientDeviceId);
        if (!device) {
            device = await (0, dbStore_js_1.upsertAuthorizedDeviceInDB)({
                device_id: clientDeviceId,
                device_name: realDeviceName,
                ip_address: clientIp,
                status: enums_js_1.DeviceStatus.APPROVED,
            });
            await (0, dbStore_js_1.createAuditLog)({
                actor_name: admin.name,
                category: 'Device Security',
                action_details: `New device login automatically approved: ${realDeviceName}`,
                ip_device: `${realDeviceName} (${clientIp})`,
            });
        }
        else {
            await (0, dbStore_js_1.upsertAuthorizedDeviceInDB)({
                device_id: clientDeviceId,
                device_name: realDeviceName,
                ip_address: clientIp,
                status: device.status,
            });
        }
        if (device && device.status === enums_js_1.DeviceStatus.BLOCKED) {
            return res.status(403).json({
                success: false,
                accountStatus: 'Device Blocked',
                message: strings_js_1.STRINGS.DEVICE_BLOCKED,
            });
        }
        if (device && device.status === enums_js_1.DeviceStatus.PENDING_APPROVAL) {
            return res.status(403).json({
                success: false,
                accountStatus: 'Device Pending Approval',
                message: strings_js_1.STRINGS.DEVICE_PENDING_APPROVAL,
            });
        }
        const adminUser = {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            role: admin.role,
        };
        const token = jsonwebtoken_1.default.sign(adminUser, config_js_1.env.ADMIN_JWT_SECRET, { expiresIn: values_js_1.VALUES.JWT_DEFAULT_EXPIRES });
        await (0, dbStore_js_1.createAuditLog)({
            actor_name: admin.name,
            category: 'Authentication',
            action_details: `Admin signed in successfully from ${realDeviceName}`,
            ip_device: `${realDeviceName} (${clientIp})`,
        });
        return res.json({
            success: true,
            message: strings_js_1.STRINGS.SIGNED_IN_SUCCESS,
            token,
            user: adminUser,
        });
    }
    catch (error) {
        next(error);
    }
});
router.post('/auth/sign-out', async (req, res, next) => {
    try {
        const realDeviceName = (0, deviceService_js_1.parseDeviceName)(req);
        const clientIp = req.headers['x-forwarded-for'] || req.ip || '127.0.0.1';
        await (0, dbStore_js_1.createAuditLog)({
            actor_name: req.admin?.name || config_js_1.env.ADMIN_NAME,
            category: 'Authentication',
            action_details: `Admin signed out from ${realDeviceName}`,
            ip_device: `${realDeviceName} (${clientIp})`,
        });
        res.json({ success: true, message: strings_js_1.STRINGS.SIGNED_OUT_SUCCESS });
    }
    catch (error) {
        next(error);
    }
});
router.get('/devices', async (req, res, next) => {
    try {
        const devices = await (0, dbStore_js_1.getAuthorizedDevicesFromDB)();
        res.json({ success: true, data: devices });
    }
    catch (error) {
        next(error);
    }
});
router.post('/devices/:id/approve', async (req, res, next) => {
    try {
        const dev = await (0, dbStore_js_1.updateDeviceStatusInDB)(req.params.id, enums_js_1.DeviceStatus.APPROVED);
        if (!dev)
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.DEVICE_NOT_FOUND });
        await (0, dbStore_js_1.createAuditLog)({
            actor_name: req.admin?.name || config_js_1.env.ADMIN_NAME,
            category: 'Device Security',
            action_details: `Approved device: ${dev.device_name} (${dev.ip_address})`,
            ip_device: (0, deviceService_js_1.parseDeviceName)(req),
        });
        res.json({ success: true, message: strings_js_1.STRINGS.DEVICE_APPROVED_SUCCESS, data: dev });
    }
    catch (error) {
        next(error);
    }
});
router.post('/devices/:id/block', async (req, res, next) => {
    try {
        const dev = await (0, dbStore_js_1.updateDeviceStatusInDB)(req.params.id, enums_js_1.DeviceStatus.BLOCKED);
        if (!dev)
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.DEVICE_NOT_FOUND });
        await (0, dbStore_js_1.createAuditLog)({
            actor_name: req.admin?.name || config_js_1.env.ADMIN_NAME,
            category: 'Device Security',
            action_details: `Blocked device: ${dev.device_name} (${dev.ip_address})`,
            ip_device: (0, deviceService_js_1.parseDeviceName)(req),
        });
        res.json({ success: true, message: strings_js_1.STRINGS.DEVICE_BLOCKED_SUCCESS, data: dev });
    }
    catch (error) {
        next(error);
    }
});
router.post('/devices/:id/unblock', async (req, res, next) => {
    try {
        const dev = await (0, dbStore_js_1.updateDeviceStatusInDB)(req.params.id, enums_js_1.DeviceStatus.APPROVED);
        if (!dev)
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.DEVICE_NOT_FOUND });
        await (0, dbStore_js_1.createAuditLog)({
            actor_name: req.admin?.name || config_js_1.env.ADMIN_NAME,
            category: 'Device Security',
            action_details: `Unblocked device: ${dev.device_name} (${dev.ip_address})`,
            ip_device: (0, deviceService_js_1.parseDeviceName)(req),
        });
        res.json({ success: true, message: strings_js_1.STRINGS.DEVICE_UNBLOCKED_SUCCESS, data: dev });
    }
    catch (error) {
        next(error);
    }
});
// Protected Admin Routes Below
router.use(adminAuthGuard_js_1.adminAuthGuard);
// ==========================================
// 2. DASHBOARD MODULE
// ==========================================
router.get('/dashboard/sales-digest', async (req, res, next) => {
    try {
        const adminOrders = await (0, dbStore_js_1.getAllOrdersWithItems)();
        const sales = await (0, dbStore_js_1.getSalesDataFromDB)();
        const totalOrders = adminOrders.length;
        const grossSales = adminOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
        const dineInOrders = adminOrders.filter((o) => o.order_type === enums_js_1.OrderType.DINE_IN).length;
        const takeawayOrders = adminOrders.filter((o) => o.order_type === enums_js_1.OrderType.TAKEAWAY).length;
        const deliveryOrders = adminOrders.filter((o) => o.order_type === enums_js_1.OrderType.DELIVERY).length;
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
                rows: sales.length > 0 ? sales.map((s) => ({
                    fullDate: s.created_at,
                    channel: s.order_source,
                    totalOrders: 1,
                    grossRevenue: s.total_price,
                    discounts: 0,
                    netSales: s.total_price,
                })) : adminOrders.map((o) => ({
                    fullDate: o.created_at,
                    channel: o.order_source,
                    totalOrders: 1,
                    grossRevenue: o.total_amount,
                    discounts: 0,
                    netSales: o.total_amount,
                })),
            },
        });
    }
    catch (error) {
        next(error);
    }
});
router.get('/dashboard/item-category-sales', async (req, res, next) => {
    try {
        const adminOrders = await (0, dbStore_js_1.getAllOrdersWithItems)();
        const sales = await (0, dbStore_js_1.getSalesDataFromDB)();
        const totalOrders = adminOrders.length;
        const grossSales = adminOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
        const categoryMap = {};
        sales.forEach((s) => {
            const cat = s.category_name || 'General';
            categoryMap[cat] = (categoryMap[cat] || 0) + s.total_price;
        });
        const categoryRevenueList = Object.entries(categoryMap).map(([name, revenue]) => ({
            name,
            revenue,
            percentage: grossSales > 0 ? Math.round((revenue / grossSales) * 100) : 0,
        }));
        res.json({
            success: true,
            data: {
                topDish: sales.length > 0 ? sales[0].item_name : (totalOrders > 0 ? 'Popular Menu Item' : 'No Sales Yet'),
                topCategory: categoryRevenueList.length > 0 ? categoryRevenueList[0].name : (totalOrders > 0 ? 'Main Category' : 'No Categories Sold Yet'),
                categoryRevenue: categoryRevenueList.length > 0 ? categoryRevenueList : (grossSales > 0 ? [{ name: 'Main Category', revenue: grossSales, percentage: 100 }] : []),
                categoryBestSellers: [],
                overallBestSellers: [],
            },
        });
    }
    catch (error) {
        next(error);
    }
});
router.get('/dashboard/audit-log', async (req, res, next) => {
    try {
        const logs = await (0, dbStore_js_1.getAuditLogsFromDB)();
        res.json({ success: true, data: logs });
    }
    catch (error) {
        next(error);
    }
});
// ==========================================
// 3. POS TERMINAL MODULE
// ==========================================
router.get('/pos/menu', async (req, res, next) => {
    try {
        const categories = await (0, dbStore_js_1.getAllCategoriesWithRelations)();
        const items = await (0, dbStore_js_1.getAllMenuItems)();
        res.json({ success: true, categories, items });
    }
    catch (error) {
        next(error);
    }
});
router.get('/pos/deals', async (req, res, next) => {
    try {
        const deals = await (0, dbStore_js_1.getAllComboDeals)();
        res.json({ success: true, deals });
    }
    catch (error) {
        next(error);
    }
});
router.post('/pos/order', async (req, res, next) => {
    try {
        const { orderType, customerName, customerPhone, deliveryAddress, items, totalAmount } = req.body;
        const settings = await (0, dbStore_js_1.getSystemSettingsFromDB)();
        const deliveryFee = orderType === enums_js_1.OrderType.DELIVERY ? (Number(settings.delivery_fee) || values_js_1.VALUES.DEFAULT_DELIVERY_FEE) : 0;
        const newOrder = await (0, dbStore_js_1.createOrderInDatabase)({
            order_source: enums_js_1.OrderSource.POS,
            order_type: orderType || enums_js_1.OrderType.DINE_IN,
            customer_id: null,
            customer_name: customerName || null,
            customer_phone: customerPhone || null,
            delivery_address: deliveryAddress || null,
            subtotal: totalAmount || 1000,
            delivery_fee: deliveryFee,
            total_amount: (totalAmount || 1000) + deliveryFee,
            items: items || [],
        });
        await (0, dbStore_js_1.createAuditLog)({
            actor_name: req.admin?.name || config_js_1.env.ADMIN_NAME,
            category: 'POS Order',
            action_details: `Placed POS Order ${newOrder.order_number} (${orderType}) for ${customerName || 'Walk-in Guest'} (Rs. ${totalAmount})`,
            ip_device: (0, deviceService_js_1.parseDeviceName)(req),
        });
        res.status(201).json({ success: true, message: strings_js_1.STRINGS.ORDER_PLACED_SUCCESS, order: newOrder });
    }
    catch (error) {
        next(error);
    }
});
// ==========================================
// 4. ORDERS & HISTORY MODULE
// ==========================================
router.get('/orders', async (req, res, next) => {
    try {
        const { search, source, type } = req.query;
        let list = await (0, dbStore_js_1.getAllOrdersWithItems)();
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
    }
    catch (error) {
        next(error);
    }
});
router.get('/orders/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const orders = await (0, dbStore_js_1.getAllOrdersWithItems)();
        const order = orders.find((o) => o.id === id);
        if (!order)
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.ORDER_NOT_FOUND });
        res.json({ success: true, data: order });
    }
    catch (error) {
        next(error);
    }
});
// ==========================================
// 5. MENU CATEGORIES MODULE
// ==========================================
router.get('/categories', async (req, res, next) => {
    try {
        const categories = await (0, dbStore_js_1.getAllCategoriesWithRelations)();
        res.json({ success: true, data: categories });
    }
    catch (error) {
        next(error);
    }
});
router.post('/categories', async (req, res, next) => {
    try {
        const { name, sizes, addOns } = req.body;
        const countRes = await (0, db_js_1.query)(`SELECT COUNT(*)::int as total FROM categories;`);
        const nextOrder = (countRes.rows[0]?.total || 0) + 1;
        const catRes = await (0, db_js_1.query)(`INSERT INTO categories (name, display_order, is_active) VALUES ($1, $2, true) RETURNING *;`, [name || 'New Category', nextOrder]);
        const newCat = catRes.rows[0];
        const insertedSizes = [];
        if (Array.isArray(sizes)) {
            for (const s of sizes) {
                if (s.enabled !== false && String(s.size_name || s.sizeName || '').trim()) {
                    const sName = String(s.size_name || s.sizeName).trim();
                    const sPrice = Number(s.base_price || s.price) || 0;
                    const sizeRes = await (0, db_js_1.query)(`INSERT INTO category_sizes (category_id, size_name, base_price) VALUES ($1, $2, $3) RETURNING *;`, [newCat.id, sName, sPrice]);
                    insertedSizes.push({
                        id: sizeRes.rows[0].id,
                        enabled: true,
                        size_name: sizeRes.rows[0].size_name,
                        base_price: Number(sizeRes.rows[0].base_price),
                    });
                }
            }
        }
        const insertedAddOns = [];
        if (Array.isArray(addOns)) {
            for (const a of addOns) {
                if (a.enabled !== false && String(a.add_on_name || a.addonName || a.name || '').trim()) {
                    const aName = String(a.add_on_name || a.addonName || a.name).trim();
                    const pricingMode = a.pricing_mode || a.pricingMode || enums_js_1.PricingMode.SINGLE;
                    const sizePricesArr = a.size_prices || a.sizePrices;
                    const sizePrices = Array.isArray(sizePricesArr)
                        ? sizePricesArr.filter((sp) => sp.enabled !== false)
                        : [];
                    const addOnRes = await (0, db_js_1.query)(`INSERT INTO category_add_ons (category_id, add_on_name, pricing_mode, size_pricing) VALUES ($1, $2, $3, $4) RETURNING *;`, [newCat.id, aName, pricingMode, JSON.stringify(sizePrices)]);
                    insertedAddOns.push({
                        id: addOnRes.rows[0].id,
                        enabled: true,
                        add_on_name: addOnRes.rows[0].add_on_name,
                        pricing_mode: addOnRes.rows[0].pricing_mode,
                        price: Number(a.price) || 0,
                        size_prices: sizePrices,
                    });
                }
            }
        }
        res.status(201).json({
            success: true,
            message: strings_js_1.STRINGS.CATEGORY_CREATED,
            data: {
                id: newCat.id,
                name: newCat.name,
                display_order: newCat.display_order,
                is_active: newCat.is_active,
                sizes: insertedSizes,
                addOns: insertedAddOns,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
router.put('/categories/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { name, is_active, sizes, addOns } = req.body;
        const checkRes = await (0, db_js_1.query)(`SELECT * FROM categories WHERE id = $1;`, [id]);
        if (checkRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.CATEGORY_NOT_FOUND });
        }
        if (name !== undefined) {
            await (0, db_js_1.query)(`UPDATE categories SET name = $1 WHERE id = $2;`, [name, id]);
        }
        if (is_active !== undefined) {
            await (0, db_js_1.query)(`UPDATE categories SET is_active = $1 WHERE id = $2;`, [Boolean(is_active), id]);
        }
        if (Array.isArray(sizes)) {
            await (0, db_js_1.query)(`DELETE FROM category_sizes WHERE category_id = $1;`, [id]);
            for (const s of sizes) {
                if (s.enabled !== false && String(s.size_name || s.sizeName || '').trim()) {
                    const sName = String(s.size_name || s.sizeName).trim();
                    const sPrice = Number(s.base_price || s.price) || 0;
                    await (0, db_js_1.query)(`INSERT INTO category_sizes (category_id, size_name, base_price) VALUES ($1, $2, $3);`, [id, sName, sPrice]);
                }
            }
        }
        if (Array.isArray(addOns)) {
            await (0, db_js_1.query)(`DELETE FROM category_add_ons WHERE category_id = $1;`, [id]);
            for (const a of addOns) {
                if (a.enabled !== false && String(a.add_on_name || a.addonName || a.name || '').trim()) {
                    const aName = String(a.add_on_name || a.addonName || a.name).trim();
                    const pricingMode = a.pricing_mode || a.pricingMode || enums_js_1.PricingMode.SINGLE;
                    const sizePricesArr = a.size_prices || a.sizePrices;
                    const sizePrices = Array.isArray(sizePricesArr)
                        ? sizePricesArr.filter((sp) => sp.enabled !== false)
                        : [];
                    await (0, db_js_1.query)(`INSERT INTO category_add_ons (category_id, add_on_name, pricing_mode, size_pricing) VALUES ($1, $2, $3, $4);`, [id, aName, pricingMode, JSON.stringify(sizePrices)]);
                }
            }
        }
        const updatedCategories = await (0, dbStore_js_1.getAllCategoriesWithRelations)();
        const updatedCat = updatedCategories.find((c) => c.id === id);
        res.json({ success: true, message: strings_js_1.STRINGS.CATEGORY_UPDATED, data: updatedCat });
    }
    catch (error) {
        next(error);
    }
});
router.delete('/categories/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const checkRes = await (0, db_js_1.query)(`SELECT * FROM categories WHERE id = $1;`, [id]);
        if (checkRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.CATEGORY_NOT_FOUND });
        }
        await (0, db_js_1.query)(`DELETE FROM categories WHERE id = $1;`, [id]);
        res.json({ success: true, message: strings_js_1.STRINGS.CATEGORY_DELETED });
    }
    catch (error) {
        next(error);
    }
});
// ==========================================
// 6. MENU ITEMS MODULE
// ==========================================
router.get('/menu', async (req, res, next) => {
    try {
        const items = await (0, dbStore_js_1.getAllMenuItems)();
        res.json({ success: true, data: items });
    }
    catch (error) {
        next(error);
    }
});
router.post('/menu', async (req, res, next) => {
    try {
        const { category_id, name, description, image_url, is_time_limited, valid_from, valid_to } = req.body;
        const result = await (0, db_js_1.query)(`INSERT INTO menu_items (category_id, name, description, image_url, is_time_limited, valid_from, valid_to, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       RETURNING *;`, [category_id || 1, name || 'New Item', description || '', image_url || '', Boolean(is_time_limited), valid_from || null, valid_to || null]);
        const inserted = result.rows[0];
        res.status(201).json({
            success: true,
            message: strings_js_1.STRINGS.MENU_ITEM_CREATED,
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
    }
    catch (error) {
        next(error);
    }
});
router.put('/menu/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const checkRes = await (0, db_js_1.query)(`SELECT * FROM menu_items WHERE id = $1;`, [id]);
        if (checkRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.MENU_ITEM_NOT_FOUND });
        }
        const currentItem = checkRes.rows[0];
        if (req.body.image_url && req.body.image_url !== currentItem.image_url) {
            deleteOldUploadFile(currentItem.image_url);
        }
        const category_id = req.body.category_id ? parseInt(req.body.category_id, 10) : currentItem.category_id;
        const name = req.body.name !== undefined ? req.body.name : currentItem.name;
        const description = req.body.description !== undefined ? req.body.description : currentItem.description;
        const image_url = req.body.image_url !== undefined ? req.body.image_url : currentItem.image_url;
        const updateRes = await (0, db_js_1.query)(`UPDATE menu_items
       SET category_id = $1, name = $2, description = $3, image_url = $4
       WHERE id = $5
       RETURNING *;`, [category_id, name, description, image_url, id]);
        const updated = updateRes.rows[0];
        res.json({
            success: true,
            message: strings_js_1.STRINGS.MENU_ITEM_UPDATED,
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
    }
    catch (error) {
        next(error);
    }
});
router.post('/menu/:id/toggle', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const result = await (0, db_js_1.query)(`UPDATE menu_items SET is_active = NOT is_active WHERE id = $1 RETURNING *;`, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.MENU_ITEM_NOT_FOUND });
        }
        const item = result.rows[0];
        res.json({ success: true, message: item.is_active ? strings_js_1.STRINGS.MENU_ITEM_ENABLED : strings_js_1.STRINGS.MENU_ITEM_DISABLED, data: item });
    }
    catch (error) {
        next(error);
    }
});
router.delete('/menu/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const checkRes = await (0, db_js_1.query)(`SELECT * FROM menu_items WHERE id = $1;`, [id]);
        if (checkRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.MENU_ITEM_NOT_FOUND });
        }
        deleteOldUploadFile(checkRes.rows[0].image_url);
        await (0, db_js_1.query)(`DELETE FROM menu_items WHERE id = $1;`, [id]);
        res.json({ success: true, message: strings_js_1.STRINGS.MENU_ITEM_DELETED });
    }
    catch (error) {
        next(error);
    }
});
// --- Combo Deals ---
router.get('/deals', async (req, res, next) => {
    try {
        const deals = await (0, dbStore_js_1.getAllComboDeals)();
        res.json({ success: true, data: deals });
    }
    catch (error) {
        next(error);
    }
});
router.post('/deals', async (req, res, next) => {
    try {
        let includedItems = [];
        try {
            includedItems = typeof req.body.included_items_json === 'string'
                ? JSON.parse(req.body.included_items_json)
                : req.body.included_items_json || [];
        }
        catch {
            includedItems = [];
        }
        const { name, description, package_price, priority_order, image_url, is_time_limited, valid_from, valid_to } = req.body;
        const result = await (0, db_js_1.query)(`INSERT INTO combo_deals (name, description, package_price, priority_order, included_items_json, image_url, is_time_limited, valid_from, valid_to, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
       RETURNING *;`, [
            name || 'New Combo Deal',
            description || '',
            Number(package_price) || 0,
            Number(priority_order) || 1,
            JSON.stringify(includedItems),
            image_url || '',
            Boolean(is_time_limited),
            valid_from || null,
            valid_to || null,
        ]);
        const inserted = result.rows[0];
        res.status(201).json({
            success: true,
            message: strings_js_1.STRINGS.COMBO_DEAL_CREATED,
            data: {
                ...inserted,
                package_price: Number(inserted.package_price),
                included_items_json: typeof inserted.included_items_json === 'string'
                    ? JSON.parse(inserted.included_items_json)
                    : inserted.included_items_json,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
router.put('/deals/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const checkRes = await (0, db_js_1.query)(`SELECT * FROM combo_deals WHERE id = $1;`, [id]);
        if (checkRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.COMBO_DEAL_NOT_FOUND });
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
        const updateRes = await (0, db_js_1.query)(`UPDATE combo_deals
       SET name = $1, description = $2, package_price = $3, priority_order = $4, image_url = $5
       WHERE id = $6
       RETURNING *;`, [name, description, package_price, priority_order, image_url, id]);
        const updated = updateRes.rows[0];
        res.json({
            success: true,
            message: strings_js_1.STRINGS.COMBO_DEAL_UPDATED,
            data: {
                ...updated,
                package_price: Number(updated.package_price),
                included_items_json: typeof updated.included_items_json === 'string'
                    ? JSON.parse(updated.included_items_json)
                    : updated.included_items_json,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
router.post('/deals/:id/toggle', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const result = await (0, db_js_1.query)(`UPDATE combo_deals SET is_active = NOT is_active WHERE id = $1 RETURNING *;`, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.COMBO_DEAL_NOT_FOUND });
        }
        const deal = result.rows[0];
        res.json({ success: true, message: deal.is_active ? strings_js_1.STRINGS.COMBO_DEAL_ENABLED : strings_js_1.STRINGS.COMBO_DEAL_DISABLED, data: deal });
    }
    catch (error) {
        next(error);
    }
});
router.delete('/deals/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const checkRes = await (0, db_js_1.query)(`SELECT * FROM combo_deals WHERE id = $1;`, [id]);
        if (checkRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.COMBO_DEAL_NOT_FOUND });
        }
        deleteOldUploadFile(checkRes.rows[0].image_url);
        await (0, db_js_1.query)(`DELETE FROM combo_deals WHERE id = $1;`, [id]);
        res.json({ success: true, message: strings_js_1.STRINGS.COMBO_DEAL_DELETED });
    }
    catch (error) {
        next(error);
    }
});
// ==========================================
// 7. EMPLOYEES MANAGEMENT MODULE
// ==========================================
router.get('/employees', async (req, res, next) => {
    try {
        const employees = await (0, dbStore_js_1.getAllEmployeesFromDB)();
        res.json({ success: true, data: employees });
    }
    catch (error) {
        next(error);
    }
});
router.post('/employees', async (req, res, next) => {
    try {
        const { full_name, phone_number, address, position } = req.body;
        const result = await (0, db_js_1.query)(`INSERT INTO employees (full_name, phone_number, address, position)
       VALUES ($1, $2, $3, $4)
       RETURNING *;`, [full_name || 'New Staff Member', phone_number || '', address || '', position || 'Chef']);
        res.status(201).json({ success: true, message: strings_js_1.STRINGS.EMPLOYEE_CREATED, data: result.rows[0] });
    }
    catch (error) {
        next(error);
    }
});
router.put('/employees/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { full_name, phone_number, address, position } = req.body;
        const result = await (0, db_js_1.query)(`UPDATE employees
       SET full_name = COALESCE($1, full_name),
           phone_number = COALESCE($2, phone_number),
           address = COALESCE($3, address),
           position = COALESCE($4, position)
       WHERE id = $5
       RETURNING *;`, [full_name, phone_number, address, position, id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.EMPLOYEE_NOT_FOUND });
        }
        res.json({ success: true, message: strings_js_1.STRINGS.EMPLOYEE_UPDATED, data: result.rows[0] });
    }
    catch (error) {
        next(error);
    }
});
router.delete('/employees/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const result = await (0, db_js_1.query)(`DELETE FROM employees WHERE id = $1 RETURNING *;`, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.EMPLOYEE_NOT_FOUND });
        }
        res.json({ success: true, message: strings_js_1.STRINGS.EMPLOYEE_DELETED });
    }
    catch (error) {
        next(error);
    }
});
// ==========================================
// 8. CUSTOMER MANAGEMENT MODULE
// ==========================================
router.get('/customers', async (req, res, next) => {
    try {
        const customers = await (0, dbStore_js_1.getAllCustomersWithStats)();
        res.json({ success: true, data: customers });
    }
    catch (error) {
        next(error);
    }
});
router.post('/customers', async (req, res, next) => {
    try {
        const name = req.body.name || 'New Customer';
        const phone_number = req.body.phone_number || '';
        const detailed_address = req.body.detailed_address || '';
        const is_blocked = Boolean(req.body.is_blocked);
        const userRes = await (0, db_js_1.query)(`INSERT INTO customers (phone_number, name, is_verified, is_blocked)
       VALUES ($1, $2, true, $3)
       ON CONFLICT (phone_number) DO UPDATE SET name = EXCLUDED.name, is_blocked = EXCLUDED.is_blocked
       RETURNING *;`, [phone_number, name, is_blocked]);
        const user = userRes.rows[0];
        if (detailed_address) {
            await (0, db_js_1.query)(`INSERT INTO customer_addresses (customer_id, detailed_address, is_default)
         VALUES ($1, $2, true);`, [user.id, detailed_address]);
        }
        res.status(201).json({
            success: true,
            message: strings_js_1.STRINGS.CUSTOMER_CREATED,
            data: {
                id: user.id,
                name: user.name,
                phone_number: user.phone_number,
                detailed_address,
                is_blocked: user.is_blocked,
                total_orders: 0,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
router.put('/customers/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { name, phone_number, detailed_address, is_blocked } = req.body;
        const userRes = await (0, db_js_1.query)(`UPDATE customers
       SET name = COALESCE($1, name),
           phone_number = COALESCE($2, phone_number),
           is_blocked = COALESCE($3, is_blocked)
       WHERE id = $4
       RETURNING *;`, [name, phone_number, is_blocked !== undefined ? Boolean(is_blocked) : null, id]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.CUSTOMER_NOT_FOUND });
        }
        if (detailed_address !== undefined) {
            await (0, db_js_1.query)(`INSERT INTO customer_addresses (customer_id, detailed_address, is_default)
         VALUES ($1, $2, true);`, [id, detailed_address]);
        }
        res.json({ success: true, message: strings_js_1.STRINGS.CUSTOMER_UPDATED, data: userRes.rows[0] });
    }
    catch (error) {
        next(error);
    }
});
router.delete('/customers/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const result = await (0, db_js_1.query)(`DELETE FROM customers WHERE id = $1 RETURNING *;`, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.CUSTOMER_NOT_FOUND });
        }
        res.json({ success: true, message: strings_js_1.STRINGS.CUSTOMER_DELETED });
    }
    catch (error) {
        next(error);
    }
});
router.post('/customers/:id/toggle-block', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const result = await (0, db_js_1.query)(`UPDATE customers SET is_blocked = NOT is_blocked WHERE id = $1 RETURNING *;`, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.CUSTOMER_NOT_FOUND });
        }
        const cust = result.rows[0];
        res.json({ success: true, message: cust.is_blocked ? strings_js_1.STRINGS.CUSTOMER_BLOCKED_MSG : strings_js_1.STRINGS.CUSTOMER_UNBLOCKED_MSG, data: cust });
    }
    catch (error) {
        next(error);
    }
});
// ==========================================
// 9. RESTAURANT & APP MANAGEMENT SETTINGS
// ==========================================
router.get('/restaurant/settings', async (req, res, next) => {
    try {
        const settings = await (0, dbStore_js_1.getSystemSettingsFromDB)();
        res.json({ success: true, data: settings });
    }
    catch (error) {
        next(error);
    }
});
router.post('/restaurant/settings', async (req, res, next) => {
    try {
        const body = req.body || {};
        for (const [key, value] of Object.entries(body)) {
            await (0, db_js_1.query)(`INSERT INTO system_settings (setting_key, setting_value)
         VALUES ($1, $2)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;`, [key, String(value)]);
        }
        const updatedSettings = await (0, dbStore_js_1.getSystemSettingsFromDB)();
        res.json({ success: true, message: strings_js_1.STRINGS.SETTINGS_UPDATED, data: updatedSettings });
    }
    catch (error) {
        next(error);
    }
});
// ==========================================
// 10. PROFILE & MEDIA UPLOAD MODULE
// ==========================================
router.get('/profile', (req, res) => {
    res.json({ success: true, data: req.admin });
});
router.post('/upload', uploadService_js_1.uploadMiddleware.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: strings_js_1.STRINGS.NO_FILE_UPLOADED });
    }
    const imageUrl = (0, uploadService_js_1.getImageUrl)(req.file.filename);
    res.json({
        success: true,
        message: strings_js_1.STRINGS.FILE_UPLOADED_SUCCESS,
        filename: req.file.filename,
        imageUrl,
    });
});
exports.default = router;
