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
const db_js_1 = require("./config/db.js");
const errorHandler_js_1 = require("./middleware/errorHandler.js");
const requestLogger_js_1 = require("./middleware/requestLogger.js");
const uploadService_js_1 = require("./services/uploadService.js");
const socketService_js_1 = require("./services/socketService.js");
const strings_js_1 = require("./constants/strings.js");
const values_js_1 = require("./constants/values.js");
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
// API Request/Response Logger Middleware
app.use(requestLogger_js_1.requestLogger);
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
// Domain Mount Points
app.use('/api/admin', adminRoutes_js_1.default);
app.use('/api/customer', customerRoutes_js_1.default);
// Global Error Handler
app.use(errorHandler_js_1.errorHandler);
const PORT = parseInt(config_js_1.env.PORT, 10) || values_js_1.VALUES.DEFAULT_PORT;
server.listen(PORT, '0.0.0.0', async () => {
    console.log(`[SERVER] ${strings_js_1.STRINGS.SERVER_START} ${PORT}`);
    console.log(`[SOCKET] ${strings_js_1.STRINGS.SOCKET_INITIALIZED}`);
    console.log(`[ROUTE] ${strings_js_1.STRINGS.UPLOADS_ROUTE} ${config_js_1.env.BASE_URL}/uploads`);
    console.log(`[ROUTE] ${strings_js_1.STRINGS.STANDALONE_UPLOAD_ENDPOINT} ${config_js_1.env.BASE_URL}/api/upload`);
    console.log(`[ROUTE] ${strings_js_1.STRINGS.ADMIN_API_BASE_ROUTE} ${config_js_1.env.BASE_URL}/api/admin`);
    console.log(`[ROUTE] ${strings_js_1.STRINGS.CUSTOMER_API_BASE_ROUTE} ${config_js_1.env.BASE_URL}/api/customer`);
    // Verify Database Connection on startup
    await (0, db_js_1.checkDatabaseConnection)();
});
