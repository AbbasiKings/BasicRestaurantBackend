import { PricingMode } from './enums.js';

export interface ApiResponseDTO<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  accountStatus?: string;
  token?: string;
  user?: any;
}

export interface AdminSignInDTO {
  email?: string;
  password?: string;
  deviceId?: string;
}

export interface SizeInputDTO {
  id?: number;
  enabled?: boolean;
  size_name?: string;
  sizeName?: string;
  base_price?: number;
  price?: number;
}

export interface AddOnInputDTO {
  id?: number;
  enabled?: boolean;
  add_on_name?: string;
  addonName?: string;
  name?: string;
  pricing_mode?: PricingMode;
  pricingMode?: PricingMode;
  price?: number;
  size_prices?: any[];
  sizePrices?: any[];
}

export interface CreateCategoryDTO {
  name: string;
  sizes?: SizeInputDTO[];
  addOns?: AddOnInputDTO[];
}

export interface CreateMenuItemDTO {
  category_id: number;
  name: string;
  description?: string;
  image_url?: string;
  is_time_limited?: boolean;
  valid_from?: string;
  valid_to?: string;
  sizes?: SizeInputDTO[];
  addons?: AddOnInputDTO[];
}

export interface CreateComboDealDTO {
  name: string;
  description?: string;
  package_price: number;
  priority_order?: number;
  included_items_json?: any;
  image_url?: string;
  is_time_limited?: boolean;
  valid_from?: string;
  valid_to?: string;
}

export interface CreateOrderDTO {
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  orderType?: string;
  items?: any[];
  totalAmount?: number;
}

export interface CustomerAuthDTO {
  phone: string;
  otp?: string;
}

export interface CustomerProfileDTO {
  phone: string;
  name: string;
  address: string;
  profilePicture?: string;
}

export interface CreateEmployeeDTO {
  full_name: string;
  phone_number: string;
  address?: string;
  position?: string;
}
