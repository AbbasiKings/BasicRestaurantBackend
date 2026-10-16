import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/config.js';
import { customerAuthGuard, CustomerRequest } from '../../middleware/customerAuthGuard.js';
import { adminCategories, adminMenuItems, adminDeals, adminOrders, adminCustomers, restaurantSettings } from '../admin/adminStore.js';
import { broadcastNewOrder } from '../../services/socketService.js';

const router = Router();

// ==========================================
// 1. AUTHENTICATION MODULE (OTP & Account Status Flow)
// ==========================================
router.post('/auth/send-otp', (req: Request, res: Response) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ success: false, message: 'Phone number required' });

  res.json({
    success: true,
    message: `Dummy OTP code 123456 sent successfully to ${phone}`,
    dummyOtp: '123456',
  });
});

router.post('/auth/verify-otp', (req: Request, res: Response) => {
  const { phone, otp } = req.body;

  if (!phone) return res.status(400).json({ success: false, message: 'Phone number required' });

  // Strict Dummy OTP Check
  if (String(otp).trim() !== '123456') {
    return res.status(400).json({
      success: false,
      message: 'Invalid OTP code. Please enter 123456.',
    });
  }

  const phoneStr = String(phone).trim();

  // Find customer in store
  const existingCust = adminCustomers.find((c) => c.phone_number === phoneStr);

  // 1. If customer is BLOCKED
  if (existingCust && existingCust.is_blocked) {
    return res.json({
      success: true,
      accountStatus: 'Blocked',
      message: 'This account is blocked by administration. Please contact customer support.',
    });
  }

  // 2. If existing active user with completed profile name
  if (existingCust && existingCust.name && existingCust.name.trim().length > 0) {
    const userPayload = {
      id: existingCust.id,
      phone: existingCust.phone_number,
      name: existingCust.name,
    };
    const token = jwt.sign(userPayload, env.CUSTOMER_JWT_SECRET, { expiresIn: '7d' });

    return res.json({
      success: true,
      accountStatus: 'Signed In',
      message: 'Signed in successfully',
      token,
      user: userPayload,
    });
  }

  // 3. If NEW number / incomplete profile -> Account Created
  if (!existingCust) {
    const newCust = {
      id: adminCustomers.length + 1,
      phone_number: phoneStr,
      name: '',
      detailed_address: '',
      profile_picture: '',
      is_blocked: false,
      total_orders: 0,
    };
    adminCustomers.push(newCust);
  }

  const targetCust = adminCustomers.find((c) => c.phone_number === phoneStr) || {
    id: adminCustomers.length,
    phone_number: phoneStr,
  };

  const newPayload = {
    id: targetCust.id,
    phone: phoneStr,
    name: '',
  };

  const token = jwt.sign(newPayload, env.CUSTOMER_JWT_SECRET, { expiresIn: '7d' });

  return res.json({
    success: true,
    accountStatus: 'Account Created',
    message: 'Account created. Please enter your name and address.',
    token,
    user: newPayload,
  });
});

// Clean JSON Profile Setup API (Name, Address & optional profilePicture URL)
router.post('/auth/user-info', (req: Request, res: Response) => {
  const { phone, name, address, profilePicture } = req.body;

  if (!phone || !name || !address) {
    return res.status(400).json({
      success: false,
      message: 'Phone number, name, and address are required.',
    });
  }

  const phoneStr = String(phone).trim();
  const cust = adminCustomers.find((c) => c.phone_number === phoneStr);

  if (cust) {
    cust.name = String(name).trim();
    cust.detailed_address = String(address).trim();
    if (profilePicture) cust.profile_picture = String(profilePicture).trim();
  } else {
    adminCustomers.push({
      id: adminCustomers.length + 1,
      phone_number: phoneStr,
      name: String(name).trim(),
      detailed_address: String(address).trim(),
      profile_picture: String(profilePicture || '').trim(),
      is_blocked: false,
      total_orders: 0,
    });
  }

  res.json({
    success: true,
    message: 'Profile information saved successfully.',
    user: {
      phone: phoneStr,
      name: String(name).trim(),
      address: String(address).trim(),
      profilePicture: String(profilePicture || '').trim(),
    },
  });
});

// Dedicated Phone Change OTP Requests
router.post('/auth/send-phone-change-otp', (req: Request, res: Response) => {
  const { currentPhone, newPhone } = req.body;

  if (!currentPhone || !newPhone) {
    return res.status(400).json({ success: false, message: 'Current phone and new phone are required.' });
  }

  const newPhoneStr = String(newPhone).trim();
  const duplicate = adminCustomers.find((c) => c.phone_number === newPhoneStr);

  if (duplicate && duplicate.phone_number !== String(currentPhone).trim()) {
    return res.status(400).json({
      success: false,
      message: 'This phone number is already registered to another account.',
    });
  }

  res.json({
    success: true,
    message: `Dummy OTP code 123456 sent successfully to ${newPhoneStr}`,
    dummyOtp: '123456',
  });
});

router.post('/auth/verify-phone-change-otp', (req: Request, res: Response) => {
  const { currentPhone, newPhone, otp } = req.body;

  if (!currentPhone || !newPhone || !otp) {
    return res.status(400).json({ success: false, message: 'Current phone, new phone, and OTP code are required.' });
  }

  if (String(otp).trim() !== '123456') {
    return res.status(400).json({ success: false, message: 'Invalid OTP code. Please enter 123456.' });
  }

  const currPhoneStr = String(currentPhone).trim();
  const newPhoneStr = String(newPhone).trim();

  const cust = adminCustomers.find((c) => c.phone_number === currPhoneStr);
  if (cust) {
    cust.phone_number = newPhoneStr;
  }

  const updatedPayload = {
    id: cust ? cust.id : Date.now(),
    phone: newPhoneStr,
    name: cust ? cust.name : '',
  };

  const token = jwt.sign(updatedPayload, env.CUSTOMER_JWT_SECRET, { expiresIn: '7d' });

  res.json({
    success: true,
    message: 'Phone number updated successfully.',
    token,
    newPhone: newPhoneStr,
    user: updatedPayload,
  });
});

// ==========================================
// 2. HOME MODULE (Menu, Items & Deals)
// ==========================================
router.get('/home/menu', (req: Request, res: Response) => {
  res.json({
    success: true,
    categories: adminCategories,
    items: adminMenuItems,
    deals: adminDeals,
  });
});

router.get('/home/items/:id', (req: Request, res: Response) => {
  const item = adminMenuItems.find((i) => i.id === parseInt(req.params.id, 10));
  if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
  res.json({ success: true, data: item });
});

router.get('/home/deals/:id', (req: Request, res: Response) => {
  const deal = adminDeals.find((d) => d.id === parseInt(req.params.id, 10));
  if (!deal) return res.status(404).json({ success: false, message: 'Deal not found' });
  res.json({ success: true, data: deal });
});

// Live App Settings Rules
router.get('/app/settings', (req: Request, res: Response) => {
  res.json({
    success: true,
    settings: {
      openingTime: restaurantSettings.opening_time || '11:00 AM',
      closingTime: restaurantSettings.closing_time || '02:00 AM',
      maxCashOrderLimit: Number(restaurantSettings.max_cash_limit) || 5000,
      deliveryFee: Number(restaurantSettings.delivery_fee) || 150,
    },
  });
});

// ==========================================
// 3. CART QUOTE MODULE
// ==========================================
router.post('/cart/quote', (req: Request, res: Response) => {
  const { items } = req.body;

  const subtotalPaisa = (items || []).reduce(
    (sum: number, item: any) => sum + (item.pricePaisa || 0) * (item.quantity || 1),
    0
  );

  const deliveryFeePaisa = (Number(restaurantSettings.delivery_fee) || 150) * 100;
  const totalPaisa = subtotalPaisa + deliveryFeePaisa;

  res.json({
    success: true,
    quote: {
      subtotalPaisa,
      deliveryFeePaisa,
      totalPaisa,
    },
  });
});

// ==========================================
// 4 & 5. ORDERS & PROFILE MODULES
// ==========================================
router.post('/orders', (req: Request, res: Response) => {
  const { customerName, customerPhone, deliveryAddress, items, totalAmount } = req.body;

  const deliveryFee = Number(restaurantSettings.delivery_fee) || 150;

  const newOrder = {
    id: adminOrders.length + 1,
    order_number: `#ORD-${1000 + adminOrders.length + 1}`,
    order_source: 'App',
    order_type: 'Delivery',
    customer_id: 1,
    customer_name: customerName || 'Customer',
    customer_phone: customerPhone || '',
    delivery_address: deliveryAddress || '',
    subtotal: totalAmount || 0,
    delivery_fee: deliveryFee,
    total_amount: (totalAmount || 0) + deliveryFee,
    created_at: new Date().toLocaleString(),
    items: items || [],
  };

  adminOrders.unshift(newOrder);

  // Broadcast real-time new_order Socket.io event to admin dashboard and live order list
  broadcastNewOrder(newOrder);

  res.status(201).json({
    success: true,
    message: 'Order placed successfully',
    order: newOrder,
  });
});

router.get('/orders/history', (req: Request, res: Response) => {
  const appOrders = adminOrders.filter((o) => o.order_source === 'App');
  res.json({ success: true, data: appOrders });
});

router.get('/profile', (req: CustomerRequest, res: Response) => {
  const phone = req.query.phone as string;
  const cust = adminCustomers.find((c) => c.phone_number === phone);

  res.json({
    success: true,
    profile: {
      id: cust ? cust.id : 1,
      phone: cust ? cust.phone_number : phone || '',
      name: cust ? cust.name : '',
      addresses: cust && cust.detailed_address ? [{ title: 'Home', address: cust.detailed_address }] : [],
      profilePicture: cust ? cust.profile_picture : '',
    },
  });
});

router.put('/profile', (req: CustomerRequest, res: Response) => {
  const { phone, name, address, profilePicture } = req.body;
  const cust = adminCustomers.find((c) => c.phone_number === phone);

  if (cust) {
    if (name) cust.name = name;
    if (address) cust.detailed_address = address;
    if (profilePicture) cust.profile_picture = profilePicture;
  }

  res.json({
    success: true,
    message: 'Profile updated successfully',
    profile: {
      phone: phone || '',
      name: name || (cust ? cust.name : ''),
      addresses: address ? [{ title: 'Home', address }] : [],
      profilePicture: cust ? cust.profile_picture : '',
    },
  });
});

export default router;
