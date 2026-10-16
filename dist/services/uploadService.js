"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getImageUrl = exports.uploadMiddleware = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const config_js_1 = require("../config/config.js");
const uploadDir = path_1.default.resolve(process.cwd(), 'uploads');
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase() || '.jpg';
        const uniqueName = `img_${Date.now()}_${Math.floor(Math.random() * 10000)}${ext}`;
        cb(null, uniqueName);
    },
});
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/gif',
        'application/octet-stream', // Allow raw byte streams from mobile HTTP multipart
    ];
    const ext = path_1.default.extname(file.originalname).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', ''];
    if (allowedTypes.includes(file.mimetype) || allowedExts.includes(ext)) {
        cb(null, true);
    }
    else {
        cb(new Error('Invalid file type. Only JPEG, PNG, WEBP, and GIF images are allowed.'));
    }
};
const maxSizeBytes = parseInt(config_js_1.env.MAX_FILE_SIZE_MB, 10) * 1024 * 1024;
exports.uploadMiddleware = (0, multer_1.default)({
    storage,
    limits: { fileSize: maxSizeBytes },
    fileFilter,
});
const getImageUrl = (filename) => {
    return `${config_js_1.env.BASE_URL}/uploads/${filename}`;
};
exports.getImageUrl = getImageUrl;
