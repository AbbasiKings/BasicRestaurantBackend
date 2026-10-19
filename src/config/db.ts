import pg from 'pg';
import { env } from './config.js';
import { STRINGS } from '../constants/strings.js';
import { VALUES } from '../constants/values.js';

const { Pool } = pg;

export const pool = new Pool({
  host: env.DB_HOST,
  port: parseInt(env.DB_PORT, 10),
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: VALUES.DB_POOL_MAX,
  idleTimeoutMillis: VALUES.DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: VALUES.DB_CONNECT_TIMEOUT_MS,
});

let isPgAvailable = false;

pool.on('error', (err: any) => {
  isPgAvailable = false;
  console.error(`[DB ERROR] ${STRINGS.DB_POOL_ERROR}`, err.message || err);
});

export const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    const client = await pool.connect();
    isPgAvailable = true;
    console.log(`[DB] ${STRINGS.DB_CONNECTED} "${env.DB_NAME}" at ${env.DB_HOST}:${env.DB_PORT}`);
    client.release();
    return true;
  } catch (error: any) {
    isPgAvailable = false;
    console.error(`[DB ERROR] ${STRINGS.DB_CONNECTION_FAILED}`, error.message || error);
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
