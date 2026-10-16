export interface SizeItem {
  id: number;
  enabled?: boolean;
  size_name: string;
  base_price: number;
}

export interface AddOnSizePrice {
  enabled: boolean;
  size_name: string;
  price: number;
}

export interface AddOnItem {
  id: number;
  enabled?: boolean;
  add_on_name: string;
  price: number;
  size_prices?: AddOnSizePrice[];
}

export interface CategoryData {
  id: number;
  name: string;
  is_system_default?: boolean;
  display_order: number;
  is_active: boolean;
  sizes: SizeItem[];
  addOns: AddOnItem[];
}

export interface ItemSize {
  id: number;
  size_name: string;
  price: number;
}

export interface ItemAddon {
  id: number;
  addon_name: string;
  price: number;
  size_prices?: AddOnSizePrice[];
}

export interface MenuItemData {
  id: number;
  category_id: number;
  name: string;
  description: string;
  image_url: string;
  has_variants: boolean;
  single_price: number | null;
  sizes: ItemSize[];
  addons: ItemAddon[];
  is_active: boolean;
}

export interface AdminDevice {
  id: string;
  device_id: string;
  device_name: string;
  ip_address: string;
  status: 'approved' | 'pending_approval' | 'blocked';
  first_seen: string;
  last_seen: string;
  approved_at?: string;
}

// Initial admin categories start empty (no default "Others")
export let adminCategories: CategoryData[] = [];

export let adminMenuItems: MenuItemData[] = [];
export let adminDeals: any[] = [];
export let adminOrders: any[] = [];
export let adminEmployees: any[] = [];
export let adminCustomers: any[] = [];
export let authorizedDevices: AdminDevice[] = [];

export let restaurantSettings = {
  opening_time: '11:00 AM',
  closing_time: '02:00 AM',
  max_cash_limit: '5000',
  delivery_fee: '150',
  min_takeaway_orders: '1',
  starting_cash: '10000',
  maintenance_mode: false,
};

export let auditLogs: any[] = [];
