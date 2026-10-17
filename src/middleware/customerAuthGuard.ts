import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/config.js';

export interface CustomerRequest extends Request {
  user?: {
    id: number;
    phone: string;
    name?: string;
    email?: string;
  };
  [key: string]: any;
}

export const customerAuthGuard = (
  req: CustomerRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Customer authentication token required',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.CUSTOMER_JWT_SECRET) as {
      id: number;
      phone: string;
      name?: string;
      email?: string;
    };

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid or expired customer token',
    });
  }
};
