export enum OrderSource {
  APP = 'App',
  POS = 'POS',
}

export enum OrderType {
  DELIVERY = 'Delivery',
  DINE_IN = 'Dine-In',
  TAKEAWAY = 'Takeaway',
}

export enum DeviceStatus {
  APPROVED = 'approved',
  PENDING_APPROVAL = 'pending_approval',
  BLOCKED = 'blocked',
}

export enum PricingMode {
  SINGLE = 'single',
  SIZE_VARIANT = 'size_variant',
}

export enum AdminRole {
  OWNER = 'Owner',
  ADMIN = 'admin',
}
