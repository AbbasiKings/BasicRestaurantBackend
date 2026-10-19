"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const strings_js_1 = require("../constants/strings.js");
const errorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
    console.error(`${strings_js_1.STRINGS.API_ERROR_LOG} ${req.method} ${req.originalUrl || req.url} - Status: ${statusCode} - Error: ${message}`);
    if (err.stack && process.env.NODE_ENV === 'development') {
        console.error(err.stack);
    }
    res.status(statusCode).json({
        success: false,
        message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
};
exports.errorHandler = errorHandler;
