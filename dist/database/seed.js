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
        // Seed default admin accounts
        await db_js_1.pool.query(`INSERT INTO admins (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING;`, ['Tariq Owner', 'admin@restaurant.com', passwordHash, 'Owner']);
        await db_js_1.pool.query(`INSERT INTO admins (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING;`, ['Tariq Owner', 'admin@gmail.com', passwordHash, 'Owner']);
        // Seed initial system settings
        await db_js_1.pool.query(`INSERT INTO system_settings (setting_key, setting_value) VALUES
       ('opening_time', '11:00 AM'),
       ('closing_time', '02:00 AM'),
       ('business_day_cutoff', '05:00 AM'),
       ('max_cash_limit', '5000'),
       ('min_takeaway_orders', '1')
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
