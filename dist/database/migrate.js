"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = __importDefault(require("pg"));
const config_js_1 = require("../config/config.js");
const db_js_1 = require("../config/db.js");
const strings_js_1 = require("../constants/strings.js");
const { Client } = pg_1.default;
async function ensureDatabaseExists() {
    const rootClient = new Client({
        host: config_js_1.env.DB_HOST,
        port: parseInt(config_js_1.env.DB_PORT, 10),
        user: config_js_1.env.DB_USER,
        password: config_js_1.env.DB_PASSWORD,
        database: 'postgres',
        ssl: config_js_1.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    });
    try {
        await rootClient.connect();
        const res = await rootClient.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [config_js_1.env.DB_NAME]);
        if (res.rowCount === 0) {
            console.log(`[DB] Database "${config_js_1.env.DB_NAME}" does not exist. Creating...`);
            await rootClient.query(`CREATE DATABASE "${config_js_1.env.DB_NAME}"`);
            console.log(`[DB] Database "${config_js_1.env.DB_NAME}" created successfully.`);
        }
        else {
            console.log(`[DB] Database "${config_js_1.env.DB_NAME}" exists.`);
        }
    }
    catch (error) {
        console.log('[DB] Skipping root database creation check (Proceeding to migrate target database).');
    }
    finally {
        try {
            await rootClient.end();
        }
        catch (_) { }
    }
}
async function runMigrations() {
    await ensureDatabaseExists();
    console.log(strings_js_1.STRINGS.MIGRATION_START);
    const migrationSQL = `
    -- 1. Migration Alterations for Backwards Compatibility

    -- Rename users table to customers if users exists
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users') THEN
        ALTER TABLE users RENAME TO customers;
      END IF;
    END $$;

    -- Drop email from customers table if exists
    ALTER TABLE customers DROP COLUMN IF EXISTS email;

    -- Rename customer_addresses user_id to customer_id if exists
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'customer_addresses' AND column_name = 'user_id') THEN
        ALTER TABLE customer_addresses RENAME COLUMN user_id TO customer_id;
      END IF;
    END $$;

    -- Drop address_title from customer_addresses if exists
    ALTER TABLE customer_addresses DROP COLUMN IF EXISTS address_title;

    -- Drop status from orders if exists
    ALTER TABLE orders DROP COLUMN IF EXISTS status;

    -- Drop special_instructions from order_items if exists
    ALTER TABLE order_items DROP COLUMN IF EXISTS special_instructions;

    -- Drop inventory_items table completely
    DROP TABLE IF EXISTS inventory_items CASCADE;

    -- Drop last_login_ip from admins if exists
    ALTER TABLE admins DROP COLUMN IF EXISTS last_login_ip;

    -- Add pricing_mode to category_add_ons if not exists
    ALTER TABLE category_add_ons ADD COLUMN IF NOT EXISTS pricing_mode VARCHAR(50) NOT NULL DEFAULT 'single';

    -- Set default status to approved for authorized_devices if exists
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'authorized_devices') THEN
        ALTER TABLE authorized_devices ALTER COLUMN status SET DEFAULT 'approved';
      END IF;
    END $$;

    -- 2. Schema Table Definitions

    -- Admins Table
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(100) NOT NULL DEFAULT 'Owner',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    -- Customers Table
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      phone_number VARCHAR(100) UNIQUE NOT NULL,
      name VARCHAR(255),
      is_verified BOOLEAN DEFAULT TRUE,
      is_blocked BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    -- Customer Addresses Table
    CREATE TABLE IF NOT EXISTS customer_addresses (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
      detailed_address TEXT NOT NULL,
      is_default BOOLEAN DEFAULT FALSE
    );

    -- Categories Table
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      display_order INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE
    );

    -- Category Sizes Table
    CREATE TABLE IF NOT EXISTS category_sizes (
      id SERIAL PRIMARY KEY,
      category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
      size_name VARCHAR(100) NOT NULL,
      base_price DECIMAL(10, 2) NOT NULL
    );

    -- Category Add-ons Table
    CREATE TABLE IF NOT EXISTS category_add_ons (
      id SERIAL PRIMARY KEY,
      category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
      add_on_name VARCHAR(255) NOT NULL,
      pricing_mode VARCHAR(50) NOT NULL DEFAULT 'single',
      size_pricing JSONB NOT NULL
    );

    -- Menu Items Table
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

    -- Combo Deals Table
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

    -- Orders Table
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      order_number VARCHAR(100) UNIQUE NOT NULL,
      order_source VARCHAR(50) NOT NULL DEFAULT 'App',
      order_type VARCHAR(50) NOT NULL DEFAULT 'Delivery',
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      customer_name VARCHAR(255),
      customer_phone VARCHAR(100),
      delivery_address TEXT,
      subtotal DECIMAL(10, 2) NOT NULL,
      delivery_fee DECIMAL(10, 2) DEFAULT 0.00,
      total_amount DECIMAL(10, 2) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    -- Order Items Table
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
      item_name VARCHAR(255) NOT NULL,
      selected_size VARCHAR(100),
      selected_add_ons JSONB,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price DECIMAL(10, 2) NOT NULL
    );

    -- Employees Table
    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      phone_number VARCHAR(100) NOT NULL,
      address TEXT,
      position VARCHAR(100) NOT NULL DEFAULT 'Staff',
      join_date DATE NOT NULL DEFAULT CURRENT_DATE
    );

    -- System Settings Table
    CREATE TABLE IF NOT EXISTS system_settings (
      id SERIAL PRIMARY KEY,
      setting_key VARCHAR(255) UNIQUE NOT NULL,
      setting_value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    -- Audit Logs Table
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      actor_name VARCHAR(255) NOT NULL,
      category VARCHAR(100) NOT NULL,
      action_details TEXT NOT NULL,
      ip_device VARCHAR(255),
      timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    -- Authorized Devices Table
    CREATE TABLE IF NOT EXISTS authorized_devices (
      id SERIAL PRIMARY KEY,
      device_id VARCHAR(255) UNIQUE NOT NULL,
      device_name VARCHAR(255) NOT NULL,
      ip_address VARCHAR(100),
      status VARCHAR(50) NOT NULL DEFAULT 'approved',
      first_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      last_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      approved_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    -- Sales Table
    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
      order_number VARCHAR(100) NOT NULL,
      order_source VARCHAR(50) NOT NULL,
      order_type VARCHAR(50) NOT NULL,
      item_name VARCHAR(255) NOT NULL,
      category_name VARCHAR(255),
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price DECIMAL(10, 2) NOT NULL,
      total_price DECIMAL(10, 2) NOT NULL,
      sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `;
    try {
        await db_js_1.pool.query(migrationSQL);
        console.log(`[DB] ${strings_js_1.STRINGS.MIGRATION_SUCCESS}`);
    }
    catch (error) {
        console.error(`[DB ERROR] ${strings_js_1.STRINGS.MIGRATION_FAILED}`, error);
    }
    finally {
        await db_js_1.pool.end();
    }
}
runMigrations();
