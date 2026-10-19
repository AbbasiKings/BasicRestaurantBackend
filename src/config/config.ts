import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  PORT: z.string().default('5000'),
  NODE_ENV: z.string().default('development'),
  ADMIN_NAME: z.string().default('Admin User'),
  ADMIN_EMAIL: z.string().default('admin@gmail.com'),
  ADMIN_PASSWORD: z.string().default('admin123'),
  ADMIN_ROLE: z.string().default('admin'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.string().default('5432'),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('postgres'),
  DB_NAME: z.string().default('restaurant_system_db'),
  DB_SSL: z.string().default('false'),
  ADMIN_JWT_SECRET: z.string().default('super_secret_admin_jwt_key_2026'),
  CUSTOMER_JWT_SECRET: z.string().default('super_secret_customer_jwt_key_2026'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  MAX_FILE_SIZE_MB: z.string().default('5'),
  BASE_URL: z.string().default('http://localhost:5000'),
  CLOUDINARY_CLOUD_NAME: z.string().default('dcjrgs9cx'),
  CLOUDINARY_API_KEY: z.string().default('575254668411548'),
  CLOUDINARY_API_SECRET: z.string().default('Trox5vwgzffInHKazzRHkYzKl6Q'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
