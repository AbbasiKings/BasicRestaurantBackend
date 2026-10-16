import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/config.js';

export interface AdminRequest extends Request {
  admin?: {
    id: number;
    name: string;
    email: string;
    role: string;
  };
}

export const adminAuthGuard = (
  req: AdminRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Admin authentication token required',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.ADMIN_JWT_SECRET) as {
      id: number;
      name: string;
      email: string;
      role: string;
    };

    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid or expired admin token',
    });
  }
};
