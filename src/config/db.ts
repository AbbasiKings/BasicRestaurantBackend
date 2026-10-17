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
  connectionTimeoutMillis: 2000,
});

let isPgAvailable = false;

pool.on('error', (err: any) => {
  // Silent error handling for idle pool when pg is not active locally
  isPgAvailable = false;
});

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
