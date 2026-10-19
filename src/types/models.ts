import { DeviceStatus, PricingMode } from './enums.js';

export interface Admin {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  created_at?: string;
}

export interface Customer {
  id: number;
  phone_number: string;
  name?: string | null;
  is_verified: boolean;
  is_blocked: boolean;
  created_at?: string;
}

export interface CustomerAddress {
  id: number;
  customer_id: number;
  detailed_address: string;
  is_default: boolean;
}

export interface Category {
  id: number;
  name: string;
  display_order: number;
  is_active: boolean;
}

export interface CategorySize {
  id: number;
  category_id: number;
  size_name: string;
  base_price: number;
}

export interface CategoryAddOn {
  id: number;
  category_id: number;
  add_on_name: string;
  pricing_mode: PricingMode;
  size_pricing: any;
}

export interface MenuItem {
  id: number;
  category_id: number;
  name: string;
  description?: string | null;
  image_url?: string | null;
  is_time_limited: boolean;
  valid_from?: string | null;
  valid_to?: string | null;
  is_active: boolean;
}

export interface ComboDeal {
  id: number;
  name: string;
  description?: string | null;
  package_price: number;
  priority_order: number;
  included_items_json: any;
  image_url?: string | null;
  is_time_limited: boolean;
  valid_from?: string | null;
  valid_to?: string | null;
  is_active: boolean;
}

export interface Order {
  id: number;
  order_number: string;
  order_source: string;
  order_type: string;
  customer_id?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  delivery_address?: string | null;
  subtotal: number;
  delivery_fee: number;
  total_amount: number;
  created_at?: string;
}

export interface OrderItem {
  id: number;
  order_id: number;
  item_name: string;
  selected_size?: string | null;
  selected_add_ons?: any;
  quantity: number;
  unit_price: number;
}

export interface Employee {
  id: number;
  full_name: string;
  phone_number: string;
  address?: string | null;
  position: string;
  join_date: string;
}

export interface SystemSetting {
  id: number;
  setting_key: string;
  setting_value: string;
  updated_at?: string;
}

export interface AuditLog {
  id: number;
  actor_name: string;
  category: string;
  action_details: string;
  ip_device?: string | null;
  timestamp?: string;
}

export interface AuthorizedDevice {
  id: number;
  device_id: string;
  device_name: string;
  ip_address?: string | null;
  status: DeviceStatus;
  first_seen?: string;
  last_seen?: string;
  approved_at?: string | null;
}

export interface Sale {
  id: number;
  order_id: number;
  order_number: string;
  order_source: string;
  order_type: string;
  item_name: string;
  category_name?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  sale_date?: string;
  created_at?: string;
}
