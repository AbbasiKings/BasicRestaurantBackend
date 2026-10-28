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
async function deleteOldUploadFile(imageUrl) {
    if (!imageUrl)
        return;
    try {
        if (imageUrl.includes('res.cloudinary.com')) {
            await (0, uploadService_js_1.deleteCloudinaryFile)(imageUrl);
        }
        else {
            const filename = imageUrl.split('/uploads/').pop();
            if (filename && !filename.startsWith('http')) {
                const filePath = path_1.default.resolve(process.cwd(), 'uploads', filename);
                if (fs_1.default.existsSync(filePath)) {
                    fs_1.default.unlinkSync(filePath);
                }
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
                action_details: `New device login request auto-authorized: ${realDeviceName}`,
                ip_device: `${realDeviceName} (${clientIp})`,
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
        const token = jsonwebtoken_1.default.sign(adminUser, config_js_1.env.ADMIN_JWT_SECRET, { expiresIn: '7d' });
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
// Device Security Endpoints
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
        // Calculate Real Dynamic Peak Busy Hours
        let peakBusyHours = 'No Orders Yet';
        if (adminOrders.length > 0) {
            const slotCounts = {};
            adminOrders.forEach((o) => {
                const timeStr = o.created_at || '';
                const match = timeStr.match(/(\d+):/);
                const isPm = timeStr.includes('PM');
                if (match) {
                    let hourNum = parseInt(match[1], 10);
                    if (isPm && hourNum < 12)
                        hourNum += 12;
                    if (!isPm && hourNum === 12)
                        hourNum = 0;
                    const startHour = Math.floor(hourNum / 2) * 2;
                    const endHour = startHour + 2;
                    const formatHour = (h) => {
                        const period = h >= 12 && h < 24 ? 'PM' : 'AM';
                        let displayH = h % 12;
                        if (displayH === 0)
                            displayH = 12;
                        return `${displayH}:00 ${period}`;
                    };
                    const slotKey = `${formatHour(startHour)} - ${formatHour(endHour)}`;
                    slotCounts[slotKey] = (slotCounts[slotKey] || 0) + 1;
                }
            });
            let maxCount = 0;
            Object.entries(slotCounts).forEach(([slot, count]) => {
                if (count > maxCount) {
                    maxCount = count;
                    peakBusyHours = slot;
                }
            });
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
        const categories = await (0, dbStore_js_1.getAllCategoriesWithRelations)();
        const menuItems = await (0, dbStore_js_1.getAllMenuItems)();
        const grossSales = adminOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
        const itemUnitsMap = {};
        const categoryRevenueMap = {};
        adminOrders.forEach((order) => {
            (order.items || []).forEach((line) => {
                const itemName = line.itemName || line.item_name || line.name || 'Dish Item';
                const qty = Number(line.quantity) || 1;
                const lineTotal = (Number(line.unit_price) || 0) * qty;
                itemUnitsMap[itemName] = (itemUnitsMap[itemName] || 0) + qty;
                let matchedCatName = 'General Menu';
                const foundItem = menuItems.find((mi) => mi.name === itemName || String(mi.id) === String(line.menu_item_id));
                if (foundItem) {
                    const foundCat = categories.find((c) => String(c.id) === String(foundItem.category_id));
                    if (foundCat)
                        matchedCatName = foundCat.name;
                }
                else if (itemName.toLowerCase().includes('pizza')) {
                    matchedCatName = 'Pizza';
                }
                else if (itemName.toLowerCase().includes('burger')) {
                    matchedCatName = 'Burger';
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
        const categoryRevenueList = Object.entries(categoryRevenueMap)
            .map(([name, revenue]) => ({
            name,
            revenue,
            percentage: grossSales > 0 ? Math.round((revenue / grossSales) * 100) : 0,
        }))
            .sort((a, b) => b.revenue - a.revenue);
        const topCategoryName = categoryRevenueList.length > 0
            ? `${categoryRevenueList[0].name} (Rs. ${categoryRevenueList[0].revenue.toLocaleString()})`
            : 'No Categories Sold Yet';
        res.json({
            success: true,
            data: {
                topDish,
                topCategory: topCategoryName,
                categoryRevenue: categoryRevenueList,
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
// 4. ALL ORDERS & HISTORY MODULE
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
        const adminOrders = await (0, dbStore_js_1.getAllOrdersWithItems)();
        const order = adminOrders.find((o) => o.id === parseInt(req.params.id, 10));
        if (!order)
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.ORDER_NOT_FOUND });
        res.json({ success: true, data: order });
    }
    catch (error) {
        next(error);
    }
});
// ==========================================
// 5. MENU CATEGORIES MODULE (WITH SIZES & ADD-ONS)
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
        const catRes = await (0, db_js_1.query)(`INSERT INTO categories (name, display_order)
       VALUES ($1, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM categories))
       RETURNING *;`, [name || 'New Category']);
        const newCat = catRes.rows[0];
        const insertedSizes = [];
        if (Array.isArray(sizes)) {
            for (const s of sizes) {
                const sName = s.size_name || s.sizeName || '';
                if (s.enabled !== false && sName.trim()) {
                    const sizeRes = await (0, db_js_1.query)(`INSERT INTO category_sizes (category_id, size_name, base_price)
             VALUES ($1, $2, $3) RETURNING *;`, [newCat.id, sName.trim(), Number(s.base_price || s.price) || 0]);
                    insertedSizes.push(sizeRes.rows[0]);
                }
            }
        }
        const insertedAddOns = [];
        if (Array.isArray(addOns)) {
            for (const a of addOns) {
                const aName = a.add_on_name || a.addonName || a.name || '';
                if (a.enabled !== false && aName.trim()) {
                    const addonRes = await (0, db_js_1.query)(`INSERT INTO category_add_ons (category_id, add_on_name, pricing_mode, base_price)
             VALUES ($1, $2, $3, $4) RETURNING *;`, [newCat.id, aName.trim(), a.sizePrices && a.sizePrices.length > 0 ? enums_js_1.AddOnPricingMode.SIZE_BASED : enums_js_1.AddOnPricingMode.FLAT, Number(a.price || a.base_price) || 0]);
                    const insertedAddon = addonRes.rows[0];
                    if (Array.isArray(a.sizePrices)) {
                        for (const sp of a.sizePrices) {
                            if (sp.enabled !== false) {
                                const spName = sp.size_name || sp.sizeName || '';
                                const matchedSize = insertedSizes.find((s) => s.size_name === spName);
                                if (matchedSize) {
                                    await (0, db_js_1.query)(`INSERT INTO category_addon_prices (category_addon_id, category_size_id, price)
                     VALUES ($1, $2, $3);`, [insertedAddon.id, matchedSize.id, Number(sp.price) || 0]);
                                }
                            }
                        }
                    }
                    insertedAddOns.push(insertedAddon);
                }
            }
        }
        res.status(201).json({
            success: true,
            message: strings_js_1.STRINGS.CATEGORY_CREATED,
            data: {
                ...newCat,
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
        const { name, sizes, addOns } = req.body;
        const catRes = await (0, db_js_1.query)(`UPDATE categories SET name = $1 WHERE id = $2 RETURNING *;`, [name, id]);
        if (catRes.rows.length === 0)
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.CATEGORY_NOT_FOUND });
        await (0, db_js_1.query)(`DELETE FROM category_sizes WHERE category_id = $1;`, [id]);
        await (0, db_js_1.query)(`DELETE FROM category_add_ons WHERE category_id = $1;`, [id]);
        const insertedSizes = [];
        if (Array.isArray(sizes)) {
            for (const s of sizes) {
                const sName = s.size_name || s.sizeName || '';
                if (s.enabled !== false && sName.trim()) {
                    const sizeRes = await (0, db_js_1.query)(`INSERT INTO category_sizes (category_id, size_name, base_price)
             VALUES ($1, $2, $3) RETURNING *;`, [id, sName.trim(), Number(s.base_price || s.price) || 0]);
                    insertedSizes.push(sizeRes.rows[0]);
                }
            }
        }
        const insertedAddOns = [];
        if (Array.isArray(addOns)) {
            for (const a of addOns) {
                const aName = a.add_on_name || a.addonName || a.name || '';
                if (a.enabled !== false && aName.trim()) {
                    const addonRes = await (0, db_js_1.query)(`INSERT INTO category_add_ons (category_id, add_on_name, pricing_mode, base_price)
             VALUES ($1, $2, $3, $4) RETURNING *;`, [id, aName.trim(), a.sizePrices && a.sizePrices.length > 0 ? enums_js_1.AddOnPricingMode.SIZE_BASED : enums_js_1.AddOnPricingMode.FLAT, Number(a.price || a.base_price) || 0]);
                    const insertedAddon = addonRes.rows[0];
                    if (Array.isArray(a.sizePrices)) {
                        for (const sp of a.sizePrices) {
                            if (sp.enabled !== false) {
                                const spName = sp.size_name || sp.sizeName || '';
                                const matchedSize = insertedSizes.find((s) => s.size_name === spName);
                                if (matchedSize) {
                                    await (0, db_js_1.query)(`INSERT INTO category_addon_prices (category_addon_id, category_size_id, price)
                     VALUES ($1, $2, $3);`, [insertedAddon.id, matchedSize.id, Number(sp.price) || 0]);
                                }
                            }
                        }
                    }
                    insertedAddOns.push(insertedAddon);
                }
            }
        }
        res.json({
            success: true,
            message: strings_js_1.STRINGS.CATEGORY_UPDATED,
            data: {
                ...catRes.rows[0],
                sizes: insertedSizes,
                addOns: insertedAddOns,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
router.delete('/categories/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const delRes = await (0, db_js_1.query)(`DELETE FROM categories WHERE id = $1 RETURNING *;`, [id]);
        if (delRes.rows.length === 0)
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.CATEGORY_NOT_FOUND });
        res.json({ success: true, message: strings_js_1.STRINGS.CATEGORY_DELETED });
    }
    catch (error) {
        next(error);
    }
});
// ==========================================
// 6. MENU ITEMS MODULE (WITH CHECKBOX SIZES & ADD-ONS)
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
        const { category_id, categoryId, name, description, image_url, imageUrl, hasVariants, single_price, singlePrice, sizes, addons } = req.body;
        const targetCatId = Number(category_id || categoryId) || 1;
        const pricingType = !hasVariants ? enums_js_1.ItemPricingType.FIXED : enums_js_1.ItemPricingType.VARIABLE;
        const basePrice = !hasVariants ? Number(single_price || singlePrice) || 0 : null;
        const itemRes = await (0, db_js_1.query)(`INSERT INTO menu_items (category_id, name, description, image_url, pricing_type, base_price)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *;`, [targetCatId, name || 'New Item', description || '', image_url || imageUrl || '', pricingType, basePrice]);
        const newItem = itemRes.rows[0];
        const insertedSizes = [];
        if (hasVariants && Array.isArray(sizes)) {
            for (let idx = 0; idx < sizes.length; idx++) {
                const s = sizes[idx];
                const sName = s.size_name || s.sizeName || 'Standard';
                const sizeRes = await (0, db_js_1.query)(`INSERT INTO menu_item_sizes (menu_item_id, size_name, price, display_order)
           VALUES ($1, $2, $3, $4) RETURNING *;`, [newItem.id, sName, Number(s.price || s.base_price) || 0, idx + 1]);
                insertedSizes.push(sizeRes.rows[0]);
            }
        }
        const insertedAddons = [];
        if (Array.isArray(addons)) {
            for (const a of addons) {
                const aName = a.addon_name || a.add_on_name || a.addonName || a.name || 'Add-on';
                const addonRes = await (0, db_js_1.query)(`INSERT INTO menu_item_addons (menu_item_id, addon_name, pricing_mode, flat_price)
           VALUES ($1, $2, $3, $4) RETURNING *;`, [newItem.id, aName, a.sizePrices && a.sizePrices.length > 0 ? enums_js_1.AddOnPricingMode.SIZE_BASED : enums_js_1.AddOnPricingMode.FLAT, Number(a.price || a.flat_price) || 0]);
                const insertedAddon = addonRes.rows[0];
                if (Array.isArray(a.sizePrices)) {
                    for (const sp of a.sizePrices) {
                        if (sp.enabled !== false) {
                            const spName = sp.size_name || sp.sizeName || '';
                            const matchedSize = insertedSizes.find((s) => s.size_name === spName);
                            if (matchedSize) {
                                await (0, db_js_1.query)(`INSERT INTO menu_item_addon_prices (menu_item_addon_id, menu_item_size_id, price)
                   VALUES ($1, $2, $3);`, [insertedAddon.id, matchedSize.id, Number(sp.price) || 0]);
                            }
                        }
                    }
                }
                insertedAddons.push(insertedAddon);
            }
        }
        res.status(201).json({
            success: true,
            message: strings_js_1.STRINGS.MENU_ITEM_CREATED,
            data: {
                ...newItem,
                sizes: insertedSizes,
                addons: insertedAddons,
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
        const { category_id, categoryId, name, description, image_url, imageUrl, hasVariants, single_price, singlePrice, sizes, addons } = req.body;
        const itemRes = await (0, db_js_1.query)(`SELECT * FROM menu_items WHERE id = $1;`, [id]);
        if (itemRes.rows.length === 0)
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.MENU_ITEM_NOT_FOUND });
        const currentItem = itemRes.rows[0];
        const targetCatId = Number(category_id || categoryId) || currentItem.category_id;
        const finalImageUrl = image_url || imageUrl || currentItem.image_url;
        if (finalImageUrl && finalImageUrl !== currentItem.image_url) {
            await deleteOldUploadFile(currentItem.image_url);
        }
        const pricingType = !hasVariants ? enums_js_1.ItemPricingType.FIXED : enums_js_1.ItemPricingType.VARIABLE;
        const basePrice = !hasVariants ? Number(single_price || singlePrice) || 0 : null;
        const updatedRes = await (0, db_js_1.query)(`UPDATE menu_items
       SET category_id = $1, name = $2, description = $3, image_url = $4, pricing_type = $5, base_price = $6
       WHERE id = $7
       RETURNING *;`, [targetCatId, name, description, finalImageUrl, pricingType, basePrice, id]);
        await (0, db_js_1.query)(`DELETE FROM menu_item_sizes WHERE menu_item_id = $1;`, [id]);
        await (0, db_js_1.query)(`DELETE FROM menu_item_addons WHERE menu_item_id = $1;`, [id]);
        const insertedSizes = [];
        if (hasVariants && Array.isArray(sizes)) {
            for (let idx = 0; idx < sizes.length; idx++) {
                const s = sizes[idx];
                const sName = s.size_name || s.sizeName || 'Standard';
                const sizeRes = await (0, db_js_1.query)(`INSERT INTO menu_item_sizes (menu_item_id, size_name, price, display_order)
           VALUES ($1, $2, $3, $4) RETURNING *;`, [id, sName, Number(s.price || s.base_price) || 0, idx + 1]);
                insertedSizes.push(sizeRes.rows[0]);
            }
        }
        const insertedAddons = [];
        if (Array.isArray(addons)) {
            for (const a of addons) {
                const aName = a.addon_name || a.add_on_name || a.addonName || a.name || 'Add-on';
                const addonRes = await (0, db_js_1.query)(`INSERT INTO menu_item_addons (menu_item_id, addon_name, pricing_mode, flat_price)
           VALUES ($1, $2, $3, $4) RETURNING *;`, [id, aName, a.sizePrices && a.sizePrices.length > 0 ? enums_js_1.AddOnPricingMode.SIZE_BASED : enums_js_1.AddOnPricingMode.FLAT, Number(a.price || a.flat_price) || 0]);
                const insertedAddon = addonRes.rows[0];
                if (Array.isArray(a.sizePrices)) {
                    for (const sp of a.sizePrices) {
                        if (sp.enabled !== false) {
                            const spName = sp.size_name || sp.sizeName || '';
                            const matchedSize = insertedSizes.find((s) => s.size_name === spName);
                            if (matchedSize) {
                                await (0, db_js_1.query)(`INSERT INTO menu_item_addon_prices (menu_item_addon_id, menu_item_size_id, price)
                   VALUES ($1, $2, $3);`, [insertedAddon.id, matchedSize.id, Number(sp.price) || 0]);
                            }
                        }
                    }
                }
                insertedAddons.push(insertedAddon);
            }
        }
        res.json({
            success: true,
            message: strings_js_1.STRINGS.MENU_ITEM_UPDATED,
            data: {
                ...updatedRes.rows[0],
                sizes: insertedSizes,
                addons: insertedAddons,
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
        const itemRes = await (0, db_js_1.query)(`UPDATE menu_items SET is_active = NOT is_active WHERE id = $1 RETURNING *;`, [id]);
        if (itemRes.rows.length === 0)
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.MENU_ITEM_NOT_FOUND });
        const item = itemRes.rows[0];
        res.json({
            success: true,
            message: `Menu item ${item.is_active ? 'enabled' : 'disabled'}`,
            data: item,
        });
    }
    catch (error) {
        next(error);
    }
});
router.delete('/menu/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const itemRes = await (0, db_js_1.query)(`DELETE FROM menu_items WHERE id = $1 RETURNING *;`, [id]);
        if (itemRes.rows.length === 0)
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.MENU_ITEM_NOT_FOUND });
        await deleteOldUploadFile(itemRes.rows[0].image_url);
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
        const { name, description, package_price, priority_order, included_items_json, image_url } = req.body;
        const dealRes = await (0, db_js_1.query)(`INSERT INTO combo_deals (name, description, package_price, priority_order, included_items_json, image_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *;`, [
            name || 'New Combo Deal',
            description || '',
            Number(package_price) || 0,
            Number(priority_order) || 1,
            JSON.stringify(included_items_json || []),
            image_url || '',
        ]);
        res.status(201).json({ success: true, message: strings_js_1.STRINGS.COMBO_DEAL_CREATED, data: dealRes.rows[0] });
    }
    catch (error) {
        next(error);
    }
});
router.put('/deals/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { name, description, package_price, priority_order, included_items_json, image_url } = req.body;
        const currentRes = await (0, db_js_1.query)(`SELECT * FROM combo_deals WHERE id = $1;`, [id]);
        if (currentRes.rows.length === 0)
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.COMBO_DEAL_NOT_FOUND });
        const currentDeal = currentRes.rows[0];
        if (image_url && image_url !== currentDeal.image_url) {
            await deleteOldUploadFile(currentDeal.image_url);
        }
        const updatedRes = await (0, db_js_1.query)(`UPDATE combo_deals
       SET name = $1, description = $2, package_price = $3, priority_order = $4, included_items_json = $5, image_url = $6
       WHERE id = $7
       RETURNING *;`, [
            name || currentDeal.name,
            description !== undefined ? description : currentDeal.description,
            package_price !== undefined ? Number(package_price) : currentDeal.package_price,
            priority_order !== undefined ? Number(priority_order) : currentDeal.priority_order,
            included_items_json ? JSON.stringify(included_items_json) : currentDeal.included_items_json,
            image_url || currentDeal.image_url,
            id,
        ]);
        res.json({ success: true, message: strings_js_1.STRINGS.COMBO_DEAL_UPDATED, data: updatedRes.rows[0] });
    }
    catch (error) {
        next(error);
    }
});
router.post('/deals/:id/toggle', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const dealRes = await (0, db_js_1.query)(`UPDATE combo_deals SET is_active = NOT is_active WHERE id = $1 RETURNING *;`, [id]);
        if (dealRes.rows.length === 0)
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.COMBO_DEAL_NOT_FOUND });
        const deal = dealRes.rows[0];
        res.json({ success: true, message: `Deal ${deal.is_active ? 'enabled' : 'disabled'}`, data: deal });
    }
    catch (error) {
        next(error);
    }
});
router.delete('/deals/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const dealRes = await (0, db_js_1.query)(`DELETE FROM combo_deals WHERE id = $1 RETURNING *;`, [id]);
        if (dealRes.rows.length === 0)
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.COMBO_DEAL_NOT_FOUND });
        await deleteOldUploadFile(dealRes.rows[0].image_url);
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
        const { full_name, phone_number, address, position, join_date } = req.body;
        const empRes = await (0, db_js_1.query)(`INSERT INTO employees (full_name, phone_number, address, position, join_date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *;`, [full_name || 'New Staff Member', phone_number || '', address || '', position || 'Chef', join_date || new Date().toISOString().split('T')[0]]);
        res.status(201).json({ success: true, message: strings_js_1.STRINGS.EMPLOYEE_CREATED, data: empRes.rows[0] });
    }
    catch (error) {
        next(error);
    }
});
router.put('/employees/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { full_name, phone_number, address, position, join_date } = req.body;
        const empRes = await (0, db_js_1.query)(`UPDATE employees
       SET full_name = COALESCE($1, full_name),
           phone_number = COALESCE($2, phone_number),
           address = COALESCE($3, address),
           position = COALESCE($4, position),
           join_date = COALESCE($5, join_date)
       WHERE id = $6
       RETURNING *;`, [full_name, phone_number, address, position, join_date, id]);
        if (empRes.rows.length === 0)
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.EMPLOYEE_NOT_FOUND });
        res.json({ success: true, message: strings_js_1.STRINGS.EMPLOYEE_UPDATED, data: empRes.rows[0] });
    }
    catch (error) {
        next(error);
    }
});
router.delete('/employees/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const empRes = await (0, db_js_1.query)(`DELETE FROM employees WHERE id = $1 RETURNING *;`, [id]);
        if (empRes.rows.length === 0)
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.EMPLOYEE_NOT_FOUND });
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
        const { name, phone_number, detailed_address, is_blocked } = req.body;
        const custRes = await (0, db_js_1.query)(`INSERT INTO customers (name, phone_number, is_blocked)
       VALUES ($1, $2, $3)
       RETURNING *;`, [name || 'New Customer', phone_number || '', Boolean(is_blocked)]);
        const newCust = custRes.rows[0];
        if (detailed_address) {
            await (0, db_js_1.query)(`INSERT INTO customer_addresses (customer_id, title, detailed_address, is_default)
         VALUES ($1, $2, $3, true);`, [newCust.id, 'Home', detailed_address]);
        }
        res.status(201).json({
            success: true,
            message: strings_js_1.STRINGS.CUSTOMER_CREATED,
            data: {
                ...newCust,
                detailed_address: detailed_address || '',
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
        const custRes = await (0, db_js_1.query)(`UPDATE customers
       SET name = COALESCE($1, name),
           phone_number = COALESCE($2, phone_number),
           is_blocked = COALESCE($3, is_blocked)
       WHERE id = $4
       RETURNING *;`, [name, phone_number, is_blocked !== undefined ? Boolean(is_blocked) : null, id]);
        if (custRes.rows.length === 0)
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.CUSTOMER_NOT_FOUND });
        if (detailed_address) {
            await (0, db_js_1.query)(`INSERT INTO customer_addresses (customer_id, title, detailed_address, is_default)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (customer_id, is_default) WHERE is_default = true DO UPDATE
         SET detailed_address = EXCLUDED.detailed_address;`, [id, 'Home', detailed_address]);
        }
        res.json({
            success: true,
            message: strings_js_1.STRINGS.CUSTOMER_UPDATED,
            data: {
                ...custRes.rows[0],
                detailed_address: detailed_address || '',
            },
        });
    }
    catch (error) {
        next(error);
    }
});
router.delete('/customers/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const custRes = await (0, db_js_1.query)(`DELETE FROM customers WHERE id = $1 RETURNING *;`, [id]);
        if (custRes.rows.length === 0)
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.CUSTOMER_NOT_FOUND });
        res.json({ success: true, message: strings_js_1.STRINGS.CUSTOMER_DELETED });
    }
    catch (error) {
        next(error);
    }
});
router.post('/customers/:id/toggle-block', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const custRes = await (0, db_js_1.query)(`UPDATE customers SET is_blocked = NOT is_blocked WHERE id = $1 RETURNING *;`, [id]);
        if (custRes.rows.length === 0)
            return res.status(404).json({ success: false, message: strings_js_1.STRINGS.CUSTOMER_NOT_FOUND });
        const cust = custRes.rows[0];
        res.json({
            success: true,
            message: `Customer ${cust.is_blocked ? 'blocked' : 'unblocked'}`,
            data: cust,
        });
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
        const body = req.body;
        for (const [key, value] of Object.entries(body)) {
            await (0, db_js_1.query)(`INSERT INTO system_settings (setting_key, setting_value)
         VALUES ($1, $2)
         ON CONFLICT (setting_key) DO UPDATE
         SET setting_value = EXCLUDED.setting_value,
             updated_at = CURRENT_TIMESTAMP;`, [key, String(value)]);
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
router.get('/profile', async (req, res, next) => {
    try {
        res.json({ success: true, data: req.admin });
    }
    catch (error) {
        next(error);
    }
});
router.post('/upload', uploadService_js_1.uploadMiddleware.single('image'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: strings_js_1.STRINGS.NO_FILE_UPLOADED });
        }
        let imageUrl = `${config_js_1.env.BASE_URL}/uploads/${req.file.filename}`;
        if (config_js_1.env.CLOUDINARY_CLOUD_NAME && req.file.buffer) {
            imageUrl = await (0, uploadService_js_1.uploadToCloudinary)(req.file.buffer);
        }
        res.json({
            success: true,
            message: strings_js_1.STRINGS.FILE_UPLOADED_SUCCESS,
            filename: req.file.filename,
            imageUrl,
        });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
