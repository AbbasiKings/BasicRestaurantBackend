import { Request, Response, NextFunction } from 'express';
import { STRINGS } from '../constants/strings.js';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.originalUrl || req.url;

  console.log(`${STRINGS.REQUEST_LOG} [${timestamp}] ${method} ${url} - Client: ${req.ip || 'unknown'}`);

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const status = res.statusCode;
    console.log(`${STRINGS.RESPONSE_LOG} [${new Date().toISOString()}] ${method} ${url} - Status: ${status} - Duration: ${duration}ms`);
  });

  next();
};
