"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPgAvailable = exports.query = exports.pool = void 0;
const pg_1 = __importDefault(require("pg"));
const config_js_1 = require("./config.js");
const { Pool } = pg_1.default;
exports.pool = new Pool({
    host: config_js_1.env.DB_HOST,
    port: parseInt(config_js_1.env.DB_PORT, 10),
    user: config_js_1.env.DB_USER,
    password: config_js_1.env.DB_PASSWORD,
    database: config_js_1.env.DB_NAME,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 1000,
});
let isPgAvailable = false;
exports.isPgAvailable = isPgAvailable;
exports.pool.on('error', (err) => {
    // Silent error handling for idle pool when pg is not active locally
    exports.isPgAvailable = isPgAvailable = false;
});
const query = async (text, params) => {
    try {
        const res = await exports.pool.query(text, params);
        exports.isPgAvailable = isPgAvailable = true;
        return res;
    }
    catch (error) {
        exports.isPgAvailable = isPgAvailable = false;
        throw error;
    }
};
exports.query = query;
