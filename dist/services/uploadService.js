"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadMiddleware = void 0;
exports.uploadToCloudinary = uploadToCloudinary;
exports.deleteCloudinaryFile = deleteCloudinaryFile;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const cloudinary_1 = require("cloudinary");
const config_js_1 = require("../config/config.js");
cloudinary_1.v2.config({
    cloud_name: config_js_1.env.CLOUDINARY_CLOUD_NAME,
    api_key: config_js_1.env.CLOUDINARY_API_KEY,
    api_secret: config_js_1.env.CLOUDINARY_API_SECRET,
    secure: true,
});
const storage = multer_1.default.memoryStorage();
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/gif',
        'application/octet-stream',
    ];
    const ext = path_1.default.extname(file.originalname || '').toLowerCase();
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
async function uploadToCloudinary(fileBuffer) {
    const uniqueName = `img_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary_1.v2.uploader.upload_stream({
            folder: 'restaurant_uploads',
            public_id: uniqueName,
            resource_type: 'image',
        }, (error, result) => {
            if (error) {
                console.error('[Cloudinary] Upload failed:', error);
                return reject(error);
            }
            if (!result || !result.secure_url) {
                return reject(new Error('Failed to retrieve secure URL from Cloudinary'));
            }
            resolve(result.secure_url);
        });
        uploadStream.end(fileBuffer);
    });
}
async function deleteCloudinaryFile(imageUrl) {
    if (!imageUrl)
        return;
    try {
        if (imageUrl.includes('res.cloudinary.com')) {
            const urlParts = imageUrl.split('/upload/');
            if (urlParts.length > 1) {
                const pathWithVersion = urlParts[1];
                const withoutVersion = pathWithVersion.replace(/^v\d+\//, '');
                const publicId = withoutVersion.substring(0, withoutVersion.lastIndexOf('.'));
                if (publicId) {
                    await cloudinary_1.v2.uploader.destroy(publicId);
                    console.log(`[Cloudinary] Successfully deleted old image: ${publicId}`);
                }
            }
        }
    }
    catch (err) {
        console.warn('[Cloudinary] Failed to delete old upload file:', err);
    }
}
