import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/config.js';
import { query } from '../../config/db.js';
import { customerAuthGuard, CustomerRequest } from '../../middleware/customerAuthGuard.js';
import {
  getAllCategoriesWithRelations,
  getAllMenuItems,
  getAllComboDeals,
  getAllOrdersWithItems,
  createOrderInDatabase,
  getSystemSettingsFromDB,
} from '../../services/dbStore.js';
import { broadcastNewOrder } from '../../services/socketService.js';

const router = Router();

// ==========================================
// 1. AUTHENTICATION MODULE
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

router.post('/auth/verify-otp', async (req: Request, res: Response, next) => {
  try {
    const { phone, otp } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number required' });

    if (String(otp).trim() !== '123456') {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP code. Please enter 123456.',
      });
    }

    const phoneStr = String(phone).trim();
    const userRes = await query(`SELECT * FROM users WHERE phone_number = $1;`, [phoneStr]);

    if (userRes.rows.length > 0) {
      const existingUser = userRes.rows[0];
      if (existingUser.is_blocked) {
        return res.json({
          success: true,
          accountStatus: 'Blocked',
          message: 'This account is blocked by administration. Please contact customer support.',
        });
      }

      if (existingUser.name && existingUser.name.trim().length > 0) {
        const userPayload = {
          id: existingUser.id,
          phone: existingUser.phone_number,
          name: existingUser.name,
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
    }

    let targetUser = userRes.rows[0];
    if (!targetUser) {
      const newUserRes = await query(
        `INSERT INTO users (phone_number, name, is_verified, is_blocked)
         VALUES ($1, '', true, false)
         RETURNING *;`,
        [phoneStr]
      );
      targetUser = newUserRes.rows[0];
    }

    const newPayload = {
      id: targetUser.id,
      phone: phoneStr,
      name: targetUser.name || '',
    };
    const token = jwt.sign(newPayload, env.CUSTOMER_JWT_SECRET, { expiresIn: '7d' });

    return res.json({
      success: true,
      accountStatus: 'Account Created',
      message: 'Account created. Please enter your name and address.',
      token,
      user: newPayload,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/auth/user-info', async (req: Request, res: Response, next) => {
  try {
    const { phone, name, address, profilePicture } = req.body;
    if (!phone || !name || !address) {
      return res.status(400).json({
        success: false,
        message: 'Phone number, name, and address are required.',
      });
    }

    const phoneStr = String(phone).trim();
    const userRes = await query(
      `INSERT INTO users (phone_number, name, is_verified, is_blocked)
       VALUES ($1, $2, true, false)
       ON CONFLICT (phone_number) DO UPDATE SET name = EXCLUDED.name
       RETURNING *;`,
      [phoneStr, String(name).trim()]
    );
    const user = userRes.rows[0];

    await query(
      `INSERT INTO customer_addresses (user_id, address_title, detailed_address, is_default)
       VALUES ($1, 'Home', $2, true);`,
      [user.id, String(address).trim()]
    );

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
  } catch (error) {
    next(error);
  }
});

router.post('/auth/send-phone-change-otp', (req: Request, res: Response) => {
  const { currentPhone, newPhone } = req.body;
  if (!currentPhone || !newPhone) {
    return res.status(400).json({ success: false, message: 'Current phone and new phone are required.' });
  }

  res.json({
    success: true,
    message: `Dummy OTP code 123456 sent successfully to ${newPhone}`,
    dummyOtp: '123456',
  });
});

router.post('/auth/verify-phone-change-otp', async (req: Request, res: Response, next) => {
  try {
    const { currentPhone, newPhone, otp } = req.body;
    if (!currentPhone || !newPhone || !otp) {
      return res.status(400).json({ success: false, message: 'Current phone, new phone, and OTP code are required.' });
    }

    if (String(otp).trim() !== '123456') {
      return res.status(400).json({ success: false, message: 'Invalid OTP code. Please enter 123456.' });
    }

    const currPhoneStr = String(currentPhone).trim();
    const newPhoneStr = String(newPhone).trim();

    const userRes = await query(
      `UPDATE users SET phone_number = $1 WHERE phone_number = $2 RETURNING *;`,
      [newPhoneStr, currPhoneStr]
    );

    const updatedUser = userRes.rows[0];
    const updatedPayload = {
      id: updatedUser ? updatedUser.id : Date.now(),
      phone: newPhoneStr,
      name: updatedUser ? updatedUser.name : '',
    };

    const token = jwt.sign(updatedPayload, env.CUSTOMER_JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      message: 'Phone number updated successfully.',
      token,
      newPhone: newPhoneStr,
      user: updatedPayload,
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 2. HOME MODULE
// ==========================================
router.get('/home/menu', async (req: Request, res: Response, next) => {
  try {
    const categories = await getAllCategoriesWithRelations();
    const items = await getAllMenuItems();
    const deals = await getAllComboDeals();
    res.json({ success: true, categories, items, deals });
  } catch (error) {
    next(error);
  }
});

router.get('/home/items/:id', async (req: Request, res: Response, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const items = await getAllMenuItems();
    const item = items.find((i) => i.id === id);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    res.json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
});

router.get('/home/deals/:id', async (req: Request, res: Response, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deals = await getAllComboDeals();
    const deal = deals.find((d) => d.id === id);
    if (!deal) return res.status(404).json({ success: false, message: 'Deal not found' });
    res.json({ success: true, data: deal });
  } catch (error) {
    next(error);
  }
});

router.get('/app/settings', async (req: Request, res: Response, next) => {
  try {
    const settings = await getSystemSettingsFromDB();
    res.json({
      success: true,
      settings: {
        openingTime: settings.opening_time || '11:00 AM',
        closingTime: settings.closing_time || '02:00 AM',
        maxCashOrderLimit: Number(settings.max_cash_limit) || 5000,
        deliveryFee: Number(settings.delivery_fee) || 150,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 3. CART QUOTE MODULE
// ==========================================
router.post('/cart/quote', async (req: Request, res: Response, next) => {
  try {
    const { items } = req.body;
    const settings = await getSystemSettingsFromDB();

    const subtotalPaisa = (items || []).reduce(
      (sum: number, item: any) => sum + (item.pricePaisa || 0) * (item.quantity || 1),
      0
    );

    const deliveryFeePaisa = (Number(settings.delivery_fee) || 150) * 100;
    const totalPaisa = subtotalPaisa + deliveryFeePaisa;

    res.json({
      success: true,
      quote: {
        subtotalPaisa,
        deliveryFeePaisa,
        totalPaisa,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 4 & 5. ORDERS & PROFILE MODULES
// ==========================================
router.post('/orders', async (req: Request, res: Response, next) => {
  try {
    const { customerName, customerPhone, deliveryAddress, items, totalAmount } = req.body;
    const settings = await getSystemSettingsFromDB();
    const deliveryFee = Number(settings.delivery_fee) || 150;

    const newOrder = await createOrderInDatabase({
      order_source: 'App',
      order_type: 'Delivery',
      customer_id: null,
      customer_name: customerName || 'Customer',
      customer_phone: customerPhone || '',
      delivery_address: deliveryAddress || '',
      subtotal: totalAmount || 0,
      delivery_fee: deliveryFee,
      total_amount: (totalAmount || 0) + deliveryFee,
      items: items || [],
    });

    broadcastNewOrder(newOrder);

    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      order: newOrder,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/orders/history', async (req: Request, res: Response, next) => {
  try {
    const allOrders = await getAllOrdersWithItems();
    const appOrders = allOrders.filter((o) => o.order_source === 'App');
    res.json({ success: true, data: appOrders });
  } catch (error) {
    next(error);
  }
});

router.get('/profile', async (req: CustomerRequest, res: Response, next) => {
  try {
    const phone = req.query.phone as string;
    const userRes = await query(
      `SELECT u.*, ca.detailed_address
       FROM users u
       LEFT JOIN customer_addresses ca ON (ca.user_id = u.id AND ca.is_default = true)
       WHERE u.phone_number = $1;`,
      [phone]
    );

    const cust = userRes.rows[0];

    res.json({
      success: true,
      profile: {
        id: cust ? cust.id : 1,
        phone: cust ? cust.phone_number : phone || '',
        name: cust ? cust.name : '',
        addresses: cust && cust.detailed_address ? [{ title: 'Home', address: cust.detailed_address }] : [],
        profilePicture: '',
      },
    });
  } catch (error) {
    next(error);
  }
});

router.put('/profile', async (req: CustomerRequest, res: Response, next) => {
  try {
    const { phone, name, address } = req.body;

    if (phone) {
      if (name) {
        await query(`UPDATE users SET name = $1 WHERE phone_number = $2;`, [name, phone]);
      }
      if (address) {
        const userRes = await query(`SELECT id FROM users WHERE phone_number = $1;`, [phone]);
        if (userRes.rows.length > 0) {
          const userId = userRes.rows[0].id;
          await query(
            `INSERT INTO customer_addresses (user_id, address_title, detailed_address, is_default)
             VALUES ($1, 'Home', $2, true);`,
            [userId, address]
          );
        }
      }
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      profile: {
        phone: phone || '',
        name: name || '',
        addresses: address ? [{ title: 'Home', address }] : [],
        profilePicture: '',
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
