import { AddOnPricingMode, ItemPricingType } from './enums.js';

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
  display_order?: number;
}

export interface AddOnInputDTO {
  id?: number;
  enabled?: boolean;
  add_on_name?: string;
  addonName?: string;
  addon_name?: string;
  name?: string;
  pricing_mode?: AddOnPricingMode | string;
  pricingMode?: AddOnPricingMode | string;
  base_price?: number;
  flat_price?: number;
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
  category_id?: number | string;
  categoryId?: number | string;
  name: string;
  description?: string;
  image_url?: string;
  imageUrl?: string;
  pricing_type?: ItemPricingType | string;
  pricingType?: ItemPricingType | string;
  hasVariants?: boolean;
  base_price?: number;
  basePrice?: number;
  single_price?: number;
  singlePrice?: number;
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
  join_date?: string;
}
