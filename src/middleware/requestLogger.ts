import { Request, Response, NextFunction } from 'express';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.originalUrl || req.url;

  // Log incoming request
  console.log(`📩 [REQ ${timestamp}] ${method} ${url} - Client: ${req.ip || 'unknown'}`);

  // Capture response completion to log status code and execution duration
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const status = res.statusCode;
    const statusIcon = status >= 400 ? '❌' : status >= 300 ? '⚠️' : '✅';
    console.log(`📤 [RES ${new Date().toISOString()}] ${statusIcon} ${method} ${url} - Status: ${status} - Duration: ${duration}ms`);
  });

  next();
};
