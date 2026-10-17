"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPgAvailable = exports.query = exports.checkDatabaseConnection = exports.pool = void 0;
const pg_1 = __importDefault(require("pg"));
const config_js_1 = require("./config.js");
const { Pool } = pg_1.default;
exports.pool = new Pool({
    host: config_js_1.env.DB_HOST,
    port: parseInt(config_js_1.env.DB_PORT, 10),
    user: config_js_1.env.DB_USER,
    password: config_js_1.env.DB_PASSWORD,
    database: config_js_1.env.DB_NAME,
    ssl: config_js_1.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});
let isPgAvailable = false;
exports.isPgAvailable = isPgAvailable;
exports.pool.on('error', (err) => {
    exports.isPgAvailable = isPgAvailable = false;
    console.error('❌ PostgreSQL Pool Idle Error:', err.message || err);
});
const checkDatabaseConnection = async () => {
    try {
        const client = await exports.pool.connect();
        exports.isPgAvailable = isPgAvailable = true;
        console.log(`✅ Database connected: Successfully connected to PostgreSQL DB "${config_js_1.env.DB_NAME}" at ${config_js_1.env.DB_HOST}:${config_js_1.env.DB_PORT}`);
        client.release();
        return true;
    }
    catch (error) {
        exports.isPgAvailable = isPgAvailable = false;
        console.error(`❌ Database connection failed: ${error.message || error}`);
        return false;
    }
};
exports.checkDatabaseConnection = checkDatabaseConnection;
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
