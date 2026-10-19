import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { env } from '../config/config.js';
import { STRINGS } from '../constants/strings.js';
import { VALUES } from '../constants/values.js';

async function seedData() {
  console.log(STRINGS.SEED_START);

  try {
    const adminEmail = (env.ADMIN_EMAIL || 'admin@gmail.com').trim().toLowerCase();
    const adminPass = env.ADMIN_PASSWORD || 'admin123';
    const passwordHash = await bcrypt.hash(adminPass, VALUES.BCRYPT_SALT_ROUNDS);

    // Seed default admin account in PostgreSQL admins table
    await pool.query(
      `INSERT INTO admins (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name, role = EXCLUDED.role;`,
      [env.ADMIN_NAME || 'Admin User', adminEmail, passwordHash, env.ADMIN_ROLE || 'Owner']
    );

    // Seed initial system settings
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value) VALUES
       ('opening_time', '06:00 AM'),
       ('closing_time', '05:00 AM'),
       ('delivery_charges', '150'),
       ('max_cash_limit', '5000')
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;`
    );

    console.log(STRINGS.SEED_SUCCESS);
  } catch (error) {
    console.error(STRINGS.SEED_FAILED, error);
  } finally {
    await pool.end();
  }
}

seedData();
