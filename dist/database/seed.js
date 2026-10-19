"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_js_1 = require("../config/db.js");
const config_js_1 = require("../config/config.js");
const strings_js_1 = require("../constants/strings.js");
const values_js_1 = require("../constants/values.js");
async function seedData() {
    console.log(strings_js_1.STRINGS.SEED_START);
    try {
        const adminEmail = (config_js_1.env.ADMIN_EMAIL || 'admin@gmail.com').trim().toLowerCase();
        const adminPass = config_js_1.env.ADMIN_PASSWORD || 'admin123';
        const passwordHash = await bcryptjs_1.default.hash(adminPass, values_js_1.VALUES.BCRYPT_SALT_ROUNDS);
        // Seed default admin account in PostgreSQL admins table
        await db_js_1.pool.query(`INSERT INTO admins (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name, role = EXCLUDED.role;`, [config_js_1.env.ADMIN_NAME || 'Admin User', adminEmail, passwordHash, config_js_1.env.ADMIN_ROLE || 'Owner']);
        // Seed initial system settings
        await db_js_1.pool.query(`INSERT INTO system_settings (setting_key, setting_value) VALUES
       ('opening_time', '06:00 AM'),
       ('closing_time', '05:00 AM'),
       ('delivery_charges', '150'),
       ('max_cash_limit', '5000')
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;`);
        console.log(strings_js_1.STRINGS.SEED_SUCCESS);
    }
    catch (error) {
        console.error(strings_js_1.STRINGS.SEED_FAILED, error);
    }
    finally {
        await db_js_1.pool.end();
    }
}
seedData();
