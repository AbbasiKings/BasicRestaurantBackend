import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';

async function seedData() {
  console.log('🌱 Seeding PostgreSQL default admin credentials...');

  try {
    const passwordHash = await bcrypt.hash('admin123', 10);

    // Seed default admin accounts
    await pool.query(
      `INSERT INTO admins (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING;`,
      ['Tariq Owner', 'admin@restaurant.com', passwordHash, 'Owner']
    );

    await pool.query(
      `INSERT INTO admins (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING;`,
      ['Tariq Owner', 'admin@gmail.com', passwordHash, 'Owner']
    );

    // Seed initial system settings
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value) VALUES
       ('opening_time', '11:00 AM'),
       ('closing_time', '02:00 AM'),
       ('business_day_cutoff', '05:00 AM'),
       ('max_cash_limit', '5000'),
       ('min_takeaway_orders', '1')
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;`
    );

    console.log('✅ Default admin credentials seeded successfully. All business tables remain empty.');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await pool.end();
  }
}

seedData();
