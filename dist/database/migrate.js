"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = __importDefault(require("pg"));
const config_js_1 = require("../config/config.js");
const db_js_1 = require("../config/db.js");
const { Client } = pg_1.default;
async function ensureDatabaseExists() {
    const rootClient = new Client({
        host: config_js_1.env.DB_HOST,
        port: parseInt(config_js_1.env.DB_PORT, 10),
        user: config_js_1.env.DB_USER,
        password: config_js_1.env.DB_PASSWORD,
        database: 'postgres', // Connect to default postgres DB first
    });
    try {
        await rootClient.connect();
        const res = await rootClient.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [config_js_1.env.DB_NAME]);
        if (res.rowCount === 0) {
            console.log(`⏳ Database "${config_js_1.env.DB_NAME}" does not exist. Creating...`);
            await rootClient.query(`CREATE DATABASE "${config_js_1.env.DB_NAME}"`);
            console.log(`✅ Database "${config_js_1.env.DB_NAME}" created successfully.`);
        }
        else {
            console.log(`✅ Database "${config_js_1.env.DB_NAME}" exists.`);
        }
    }
    catch (error) {
        console.error('❌ Error checking/creating database:', error);
    }
    finally {
        await rootClient.end();
    }
}
async function runMigrations() {
    await ensureDatabaseExists();
    console.log('⏳ Running PostgreSQL Schema Migrations...');
    const migrationSQL = `
    -- 1. Admins Table
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(100) NOT NULL DEFAULT 'Owner',
      last_login_ip VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Users Table
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      phone_number VARCHAR(100) UNIQUE NOT NULL,
      name VARCHAR(255),
      email VARCHAR(255),
      is_verified BOOLEAN DEFAULT TRUE,
      is_blocked BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. Customer Addresses Table
    CREATE TABLE IF NOT EXISTS customer_addresses (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      address_title VARCHAR(100) DEFAULT 'Home',
      detailed_address TEXT NOT NULL,
      is_default BOOLEAN DEFAULT FALSE
    );

    -- 4. Categories Table
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      display_order INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE
    );

    -- 5. Category Sizes Table
    CREATE TABLE IF NOT EXISTS category_sizes (
      id SERIAL PRIMARY KEY,
      category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
      size_name VARCHAR(100) NOT NULL,
      base_price DECIMAL(10, 2) NOT NULL
    );

    -- 6. Category Add-ons Table
    CREATE TABLE IF NOT EXISTS category_add_ons (
      id SERIAL PRIMARY KEY,
      category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
      add_on_name VARCHAR(255) NOT NULL,
      size_pricing JSONB NOT NULL
    );

    -- 7. Menu Items Table
    CREATE TABLE IF NOT EXISTS menu_items (
      id SERIAL PRIMARY KEY,
      category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      image_url VARCHAR(500),
      is_time_limited BOOLEAN DEFAULT FALSE,
      valid_from DATE,
      valid_to DATE,
      is_active BOOLEAN DEFAULT TRUE
    );

    -- 8. Combo Deals Table
    CREATE TABLE IF NOT EXISTS combo_deals (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      package_price DECIMAL(10, 2) NOT NULL,
      priority_order INTEGER DEFAULT 0,
      included_items_json JSONB NOT NULL,
      image_url VARCHAR(500),
      is_time_limited BOOLEAN DEFAULT FALSE,
      valid_from DATE,
      valid_to DATE,
      is_active BOOLEAN DEFAULT TRUE
    );

    -- 9. Inventory Items Table
    CREATE TABLE IF NOT EXISTS inventory_items (
      id SERIAL PRIMARY KEY,
      ingredient_name VARCHAR(255) NOT NULL,
      unit_price DECIMAL(10, 2) NOT NULL,
      unit_type VARCHAR(50) NOT NULL DEFAULT 'pc',
      stock_amount DECIMAL(10, 2) NOT NULL,
      stock_status VARCHAR(100) NOT NULL DEFAULT 'In Stock'
    );

    -- 10. Orders Table
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      order_number VARCHAR(100) UNIQUE NOT NULL,
      order_source VARCHAR(50) NOT NULL DEFAULT 'App',
      order_type VARCHAR(50) NOT NULL DEFAULT 'Delivery',
      customer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      customer_name VARCHAR(255),
      customer_phone VARCHAR(100),
      delivery_address TEXT,
      subtotal DECIMAL(10, 2) NOT NULL,
      delivery_fee DECIMAL(10, 2) DEFAULT 0.00,
      total_amount DECIMAL(10, 2) NOT NULL,
      status VARCHAR(100) NOT NULL DEFAULT 'Just Placed',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    -- 11. Order Items Table
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
      item_name VARCHAR(255) NOT NULL,
      selected_size VARCHAR(100),
      selected_add_ons JSONB,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price DECIMAL(10, 2) NOT NULL,
      special_instructions TEXT
    );

    -- 12. Employees Table
    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      phone_number VARCHAR(100) NOT NULL,
      address TEXT,
      position VARCHAR(100) NOT NULL DEFAULT 'Staff',
      join_date DATE NOT NULL DEFAULT CURRENT_DATE
    );

    -- 13. System Settings Table
    CREATE TABLE IF NOT EXISTS system_settings (
      id SERIAL PRIMARY KEY,
      setting_key VARCHAR(255) UNIQUE NOT NULL,
      setting_value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    -- 14. Audit Logs Table
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      actor_name VARCHAR(255) NOT NULL,
      category VARCHAR(100) NOT NULL,
      action_details TEXT NOT NULL,
      ip_device VARCHAR(255),
      timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `;
    try {
        await db_js_1.pool.query(migrationSQL);
        console.log('✅ All 12 PostgreSQL tables migrated successfully.');
    }
    catch (error) {
        console.error('❌ Migration failed:', error);
    }
    finally {
        await db_js_1.pool.end();
    }
}
runMigrations();
