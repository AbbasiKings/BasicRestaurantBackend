import pg from 'pg';
import { env } from './config.js';

const { Pool } = pg;

export const pool = new Pool({
  host: env.DB_HOST,
  port: parseInt(env.DB_PORT, 10),
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

let isPgAvailable = false;

pool.on('error', (err: any) => {
  isPgAvailable = false;
  console.error('❌ PostgreSQL Pool Idle Error:', err.message || err);
});

export const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    const client = await pool.connect();
    isPgAvailable = true;
    console.log(`✅ Database connected: Successfully connected to PostgreSQL DB "${env.DB_NAME}" at ${env.DB_HOST}:${env.DB_PORT}`);
    client.release();
    return true;
  } catch (error: any) {
    isPgAvailable = false;
    console.error(`❌ Database connection failed: ${error.message || error}`);
    return false;
  }
};

export const query = async (text: string, params?: any[]) => {
  try {
    const res = await pool.query(text, params);
    isPgAvailable = true;
    return res;
  } catch (error) {
    isPgAvailable = false;
    throw error;
  }
};

export { isPgAvailable };
