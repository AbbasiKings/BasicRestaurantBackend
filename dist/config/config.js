"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const zod_1 = require("zod");
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), '.env') });
const envSchema = zod_1.z.object({
    PORT: zod_1.z.string().default('5000'),
    NODE_ENV: zod_1.z.string().default('development'),
    ADMIN_NAME: zod_1.z.string().default('Admin User'),
    ADMIN_EMAIL: zod_1.z.string().default('admin@gmail.com'),
    ADMIN_PASSWORD: zod_1.z.string().default('admin123'),
    ADMIN_ROLE: zod_1.z.string().default('admin'),
    DB_HOST: zod_1.z.string().default('localhost'),
    DB_PORT: zod_1.z.string().default('5432'),
    DB_USER: zod_1.z.string().default('postgres'),
    DB_PASSWORD: zod_1.z.string().default('postgres'),
    DB_NAME: zod_1.z.string().default('restaurant_system_db'),
    DB_SSL: zod_1.z.string().default('false'),
    ADMIN_JWT_SECRET: zod_1.z.string().default('super_secret_admin_jwt_key_2026'),
    CUSTOMER_JWT_SECRET: zod_1.z.string().default('super_secret_customer_jwt_key_2026'),
    JWT_EXPIRES_IN: zod_1.z.string().default('7d'),
    MAX_FILE_SIZE_MB: zod_1.z.string().default('5'),
    BASE_URL: zod_1.z.string().default('http://localhost:5000'),
    CLOUDINARY_CLOUD_NAME: zod_1.z.string().default('dcjrgs9cx'),
    CLOUDINARY_API_KEY: zod_1.z.string().default('575254668411548'),
    CLOUDINARY_API_SECRET: zod_1.z.string().default('Trox5vwgzffInHKazzRHkYzKl6Q'),
});
const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
    console.error('Invalid environment variables:', parsedEnv.error.format());
    process.exit(1);
}
exports.env = parsedEnv.data;
