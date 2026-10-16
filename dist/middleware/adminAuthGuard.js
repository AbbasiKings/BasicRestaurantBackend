"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminAuthGuard = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_js_1 = require("../config/config.js");
const adminAuthGuard = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized: Admin authentication token required',
        });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, config_js_1.env.ADMIN_JWT_SECRET);
        req.admin = decoded;
        next();
    }
    catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized: Invalid or expired admin token',
        });
    }
};
exports.adminAuthGuard = adminAuthGuard;
