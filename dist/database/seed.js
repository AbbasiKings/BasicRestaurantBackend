"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_js_1 = require("../config/db.js");
async function seedData() {
    console.log('🌱 Seeding PostgreSQL default admin credentials...');
    try {
        const passwordHash = await bcryptjs_1.default.hash('admin123', 10);
        // Seed default admin account
        await db_js_1.pool.query(`INSERT INTO admins (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING;`, ['Admin User', 'admin@gmail.com', passwordHash, 'admin']);
        // Seed initial system settings
        await db_js_1.pool.query(`INSERT INTO system_settings (setting_key, setting_value) VALUES
       ('opening_time', '06:00 AM'),
       ('closing_time', '05:00 AM'),
       ('delivery_charges', '50'),
       ('max_cash_limit', '5000')
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;`);
        console.log('✅ Default admin credentials seeded successfully. All business tables remain empty.');
    }
    catch (error) {
        console.error('❌ Seeding failed:', error);
    }
    finally {
        await db_js_1.pool.end();
    }
}
seedData();
