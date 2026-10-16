"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const path_1 = __importDefault(require("path"));
const http_1 = require("http");
const config_js_1 = require("./config/config.js");
const errorHandler_js_1 = require("./middleware/errorHandler.js");
const uploadService_js_1 = require("./services/uploadService.js");
const socketService_js_1 = require("./services/socketService.js");
const adminRoutes_js_1 = __importDefault(require("./modules/admin/adminRoutes.js"));
const customerRoutes_js_1 = __importDefault(require("./modules/customer/customerRoutes.js"));
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
// Initialize Socket.io Server
(0, socketService_js_1.initSocketServer)(server);
// Global Middlewares
app.use((0, helmet_1.default)({ crossOriginResourcePolicy: false }));
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Serve Static Uploads Directory
const uploadsDir = path_1.default.resolve(process.cwd(), 'uploads');
app.use('/uploads', express_1.default.static(uploadsDir));
// Health Check Endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Restaurant System Backend API',
        time: new Date().toISOString(),
    });
});
// Standalone Image Upload API Endpoint
app.post('/api/upload', uploadService_js_1.uploadMiddleware.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No image file provided' });
    }
    const imageUrl = (0, uploadService_js_1.getImageUrl)(req.file.filename);
    res.json({
        success: true,
        message: 'Image uploaded successfully',
        filename: req.file.filename,
        imageUrl,
    });
});
app.post('/upload', uploadService_js_1.uploadMiddleware.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No image file provided' });
    }
    const imageUrl = (0, uploadService_js_1.getImageUrl)(req.file.filename);
    res.json({
        success: true,
        message: 'Image uploaded successfully',
        filename: req.file.filename,
        imageUrl,
    });
});
// Domain Mount Points
app.use('/api/admin', adminRoutes_js_1.default);
app.use('/api/customer', customerRoutes_js_1.default);
// Global Error Handler
app.use(errorHandler_js_1.errorHandler);
const PORT = parseInt(config_js_1.env.PORT, 10) || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Restaurant System Backend API running on port ${PORT} (0.0.0.0)`);
    console.log(`🔌 Socket.io server initialized and listening for events`);
    console.log(`📁 Public media uploads route: ${config_js_1.env.BASE_URL}/uploads`);
    console.log(`📷 Standalone upload endpoint: ${config_js_1.env.BASE_URL}/api/upload`);
    console.log(`💻 Admin API base route: ${config_js_1.env.BASE_URL}/api/admin`);
    console.log(`📱 Customer API base route: ${config_js_1.env.BASE_URL}/api/customer`);
});
