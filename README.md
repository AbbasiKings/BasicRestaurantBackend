# 🍽️ Restaurant System Backend API

A production-grade, highly scalable **Node.js + Express + TypeScript** REST API and real-time **Socket.io** WebSocket server powering the Restaurant Admin Web Portal and Customer Mobile Application. Connected to a live **Aiven PostgreSQL** relational database and **Cloudinary CDN** permanent media storage.

---

## 🛠️ Tech Stack & Key Libraries

- **Runtime:** Node.js (v24+ / ES Modules)
- **Language:** TypeScript 5.4
- **Web Framework:** Express 4.19
- **Database:** PostgreSQL (Aiven Cloud in Production) with `pg` pool driver
- **Real-Time Engine:** Socket.io v4
- **Cloud Storage:** Cloudinary CDN (`cloudinary` SDK + `multer` memory storage)
- **Security & Authentication:** JWT (`jsonwebtoken`), Password Hashing (`bcryptjs`), HTTP Security Headers (`helmet`), CORS (`cors`)
- **Environment & Validation:** `dotenv`, `zod`

---

## 📁 Directory & Module Architecture

```text
backend/
├── src/
│   ├── config/              # Environment & Database pool configuration (db.ts, config.ts)
│   ├── constants/           # Centralized Strings (STRINGS) and Values (VALUES) constants
│   ├── database/            # Relational PostgreSQL migration and seed scripts (migrate.ts, seed.ts)
│   ├── middleware/          # Auth guards (admin/customer), request logger, global error handler
│   ├── modules/             # API domain routes
│   │   ├── admin/           # Admin Portal APIs (auth, POS, menu, deals, reports, devices)
│   │   └── customer/        # Customer App APIs (OTP auth, home menu, cart, orders, profile)
│   ├── services/            # Database store queries (dbStore.ts), Cloudinary storage, Socket.io
│   ├── types/               # TypeScript Enums, DB Models, and API DTOs
│   └── server.ts            # Application entry point & Express server listener
├── dist/                    # Compiled JavaScript build output
├── uploads/                 # Static fallback uploads directory
├── postman_collection.json  # Complete Postman API collection
├── package.json             # NPM dependencies and build scripts
└── README.md                # System documentation
```

---

## 🗄️ Relational Database Schema (19 Tables)

The database runs on **PostgreSQL** with zero JSON columns for sizes and add-ons, utilizing fully normalized relational tables:

1. **`admins`**: Stores super-admin accounts and hashed passwords (`id`, `name`, `email`, `password_hash`, `role`).
2. **`customers`**: Stores customer accounts (`id`, `phone_number`, `name`, `is_verified`, `is_blocked`).
3. **`customer_addresses`**: Stores delivery locations (`id`, `customer_id`, `detailed_address`, `is_default`).
4. **`categories`**: Top-level product groups like Pizza, Burgers (`id`, `name`, `display_order`, `is_active`).
5. **`category_sizes`**: Category template sizes (`id`, `category_id`, `size_name`, `base_price`).
6. **`category_add_ons`**: Category template add-ons (`id`, `category_id`, `add_on_name`, `pricing_mode`, `base_price`).
7. **`category_addon_prices`**: Relational size-dependent prices for template add-ons (`id`, `category_addon_id`, `category_size_id`, `price`).
8. **`menu_items`**: Core food items (`id`, `category_id`, `name`, `description`, `image_url`, `pricing_type`, `base_price`, `is_time_limited`, `valid_from`, `valid_to`, `is_active`).
9. **`menu_item_sizes`**: Item-specific snapshot sizes (`id`, `menu_item_id`, `size_name`, `price`, `display_order`).
10. **`menu_item_addons`**: Item-specific snapshot add-ons (`id`, `menu_item_id`, `addon_name`, `pricing_mode`, `flat_price`).
11. **`menu_item_addon_prices`**: Relational size-dependent add-on price lookup for items (`id`, `menu_item_addon_id`, `menu_item_size_id`, `price`).
12. **`combo_deals`**: Package deal packages (`id`, `name`, `description`, `package_price`, `priority_order`, `included_items_json`, `image_url`).
13. **`orders`**: Customer and POS orders (`id`, `order_number`, `order_source`, `order_type`, `customer_id`, `customer_name`, `customer_phone`, `delivery_address`, `subtotal`, `delivery_fee`, `total_amount`).
14. **`order_items`**: Line items for orders (`id`, `order_id`, `item_name`, `selected_size`, `selected_add_ons`, `quantity`, `unit_price`).
15. **`employees`**: Staff records (`id`, `full_name`, `phone_number`, `address`, `position`, `join_date`).
16. **`system_settings`**: Key-value pairs for store timing, delivery charges, and cash limits (`id`, `setting_key`, `setting_value`).
17. **`audit_logs`**: Administrative activity security logs (`id`, `actor_name`, `category`, `action_details`, `ip_device`, `timestamp`).
18. **`authorized_devices`**: Approved devices tracking (`id`, `device_id`, `device_name`, `ip_address`, `status`, `first_seen`, `last_seen`, `approved_at`).
19. **`sales`**: Granular item sales records for financial reports (`id`, `order_id`, `order_number`, `order_source`, `order_type`, `item_name`, `category_name`, `quantity`, `unit_price`, `total_price`, `sale_date`).

---

## 🔑 Environment Variables Reference

Configure the following key-value pairs in `.env` (Local) and Render Dashboard (Production):

| Key | Description | Local Default | Production (Render) |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Application environment mode | `development` | `production` |
| `PORT` | HTTP server port | `5000` | *(Leave empty / Render managed)* |
| `BASE_URL` | Base root URL of backend service | `http://localhost:5000` | `https://basicrestaurantbackend.onrender.com` |
| `DB_HOST` | PostgreSQL hostname | `localhost` | `pg-32dcd5b8-basic-restaurant.d.aivencloud.com` |
| `DB_PORT` | PostgreSQL port | `5432` | `24651` |
| `DB_USER` | PostgreSQL username | `postgres` | `avnadmin` |
| `DB_PASSWORD` | PostgreSQL password | `postgres` | *(Aiven Password)* |
| `DB_NAME` | PostgreSQL database name | `restaurant_system_db` | `defaultdb` |
| `DB_SSL` | SSL encryption flag | `false` | `true` |
| `ADMIN_JWT_SECRET` | Secret key for Admin JWTs | `super_secret_admin_jwt_key_2026` | *(Production Secret)* |
| `CUSTOMER_JWT_SECRET` | Secret key for Customer JWTs | `super_secret_customer_jwt_key_2026` | *(Production Secret)* |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account name | `dcjrgs9cx` | `dcjrgs9cx` |
| `CLOUDINARY_API_KEY` | Cloudinary API Key | `575254668411548` | `575254668411548` |
| `CLOUDINARY_API_SECRET` | Cloudinary API Secret | `Trox5vwgzffInHKazzRHkYzKl6Q` | `Trox5vwgzffInHKazzRHkYzKl6Q` |

---

## 📡 Complete REST API Endpoint Reference

### 1. Health Check & File Uploads
- `GET /health` - System health check.
- `POST /api/upload` - Upload image to Cloudinary CDN (returns permanent HTTPS URL).

### 2. Admin Module (`/api/admin`)
- **Authentication & Security:**
  - `POST /auth/sign-in` - Admin login (authenticated against PostgreSQL `admins` table with `bcrypt`).
  - `POST /auth/sign-out` - Admin logout (logs audit log).
  - `GET /devices` - Get list of registered devices.
  - `POST /devices/:id/approve` - Approve device.
  - `POST /devices/:id/block` - Block device.
  - `POST /devices/:id/unblock` - Unblock device.
- **Dashboard & Analytics:**
  - `GET /dashboard/sales-digest` - Get sales KPIs, order totals, and revenue metrics.
  - `GET /dashboard/item-category-sales` - Get top dish, top category, and category revenue breakdown.
  - `GET /dashboard/audit-log` - Get system audit logs.
- **POS Terminal:**
  - `GET /pos/menu` - Fetch menu categories and items for POS interface.
  - `GET /pos/deals` - Fetch active combo deals for POS.
  - `POST /pos/order` - Place POS order (Dine-In, Takeaway, or Delivery).
- **Order Management:**
  - `GET /orders` - Fetch all orders (filterable by `source`, `type`, or `search`).
  - `GET /orders/:id` - Fetch order details by ID.
- **Categories Management (Templates):**
  - `GET /categories` - Get all categories with sizes and add-on pricing templates.
  - `POST /categories` - Create new category with sizes and flat/size-based add-ons.
  - `PUT /categories/:id` - Update category, sizes, and add-ons.
  - `DELETE /categories/:id` - Delete category.
- **Menu Items Management (Snapshots):**
  - `GET /menu` - Get all menu items with sizes and add-ons.
  - `POST /menu` - Create menu item with fixed or variable pricing and custom sizes/add-ons.
  - `PUT /menu/:id` - Update menu item details, sizes, and add-ons.
  - `POST /menu/:id/toggle` - Toggle active status of a menu item.
  - `DELETE /menu/:id` - Delete menu item (automatically destroys image on Cloudinary CDN).
- **Combo Deals Management:**
  - `GET /deals` - Get combo deals.
  - `POST /deals` - Create combo deal.
  - `PUT /deals/:id` - Update combo deal.
  - `POST /deals/:id/toggle` - Toggle deal active status.
  - `DELETE /deals/:id` - Delete combo deal.
- **Employees Management:**
  - `GET /employees` - Get staff records.
  - `POST /employees` - Create staff member.
  - `PUT /employees/:id` - Update staff details.
  - `DELETE /employees/:id` - Delete staff member.
- **Customers Management:**
  - `GET /customers` - Get customer directory with total order counts and delivery addresses.
  - `POST /customers` - Create customer record manually.
  - `PUT /customers/:id` - Update customer record.
  - `DELETE /customers/:id` - Delete customer record.
  - `POST /customers/:id/toggle-block` - Block/unblock customer.
- **Restaurant Settings:**
  - `GET /restaurant/settings` - Get restaurant system settings.
  - `POST /restaurant/settings` - Update settings (opening/closing times, delivery fee, cash limits).

### 3. Customer Module (`/api/customer`)
- **Authentication:**
  - `POST /auth/send-otp` - Request OTP for customer phone authentication.
  - `POST /auth/verify-otp` - Verify OTP (`123456`) and issue JWT token.
  - `POST /auth/user-info` - Save customer profile name and delivery address.
  - `POST /auth/send-phone-change-otp` - Request OTP to update registered phone number.
  - `POST /auth/verify-phone-change-otp` - Verify phone number change.
- **Home Menu & Ordering:**
  - `GET /home/menu` - Fetch menu categories, items, and deals.
  - `GET /home/items/:id` - Fetch item details by ID.
  - `GET /home/deals/:id` - Fetch combo deal details by ID.
  - `GET /app/settings` - Fetch store opening/closing times and delivery charges.
  - `POST /cart/quote` - Calculate cart quote and subtotal/total fees.
  - `POST /orders` - Place customer app delivery order.
  - `GET /orders/history` - Get customer order history.
  - `GET /profile` - Get customer profile and addresses.
  - `PUT /profile` - Update customer profile.

---

## ⚡ Real-Time Socket.io Events

The server initializes Socket.io on startup.
- **`new_order` Event:** Broadcasted automatically whenever a POS or Customer Mobile App order is created:
```json
{
  "id": 1,
  "order_number": "#ORD-1001",
  "order_source": "App",
  "order_type": "Delivery",
  "customer_name": "John Doe",
  "total_amount": 1500,
  "items": [...]
}
```

---

## ☁️ Permanent Cloudinary Media Storage

Media uploads use `Multer` with RAM memory storage (`multer.memoryStorage()`) streaming directly to Cloudinary CDN under the `restaurant_uploads` folder with unique public IDs (`img_<timestamp>_<random>`).

- **Permanent Links:** Returns `https://res.cloudinary.com/...` CDN URLs that never vanish when Render restarts.
- **Automatic Old Image Deletion:** Updating or deleting a menu item or combo deal automatically destroys the old image from Cloudinary CDN via `cloudinary.uploader.destroy()`.

---

## 🚀 Local Setup & Render Deployment

### 1. Local Development Commands
```bash
# Install dependencies
npm install

# Build TypeScript code
npm run build

# Run database schema migrations
npm run db:migrate

# Seed default admin credentials & settings
npm run db:seed

# Start hot-reloading dev server
npm run dev
```

### 2. Render Deployment Configuration
Set the following commands in **Render Web Service Settings**:
- **Build Command:** `npm run build`
- **Start Command:** `npm start` *(Automatically executes `db:migrate`, `db:seed`, and launches `node dist/server.js`)*

---

## 📬 Postman API Collection

A complete, ready-to-import Postman Collection is available in [`postman_collection.json`](file:///home/abbasi/Desktop/Resturaunt%20System%20Basic%20Edition/postman_collection.json).
- Includes all Admin, Customer, POS, Category, Menu Item, and Upload endpoints with pre-configured environment variables (`{{base_url}}`, `{{admin_token}}`, `{{customer_token}}`).
