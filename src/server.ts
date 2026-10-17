import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { createServer } from 'http';
import { env } from './config/config.js';
import { checkDatabaseConnection } from './config/db.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { uploadMiddleware, getImageUrl } from './services/uploadService.js';
import { initSocketServer } from './services/socketService.js';
import adminRoutes from './modules/admin/adminRoutes.js';
import customerRoutes from './modules/customer/customerRoutes.js';

const app = express();
const server = createServer(app);

// Initialize Socket.io Server
initSocketServer(server);

// Global Middlewares
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Request/Response Logger Middleware
app.use(requestLogger);

// Serve Static Uploads Directory
const uploadsDir = path.resolve(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadsDir));

// Health Check Endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'Restaurant System Backend API',
    time: new Date().toISOString(),
  });
});

// Standalone Image Upload API Endpoint
app.post('/api/upload', uploadMiddleware.single('image'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No image file provided' });
  }

  const imageUrl = getImageUrl(req.file.filename);
  res.json({
    success: true,
    message: 'Image uploaded successfully',
    filename: req.file.filename,
    imageUrl,
  });
});

app.post('/upload', uploadMiddleware.single('image'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No image file provided' });
  }

  const imageUrl = getImageUrl(req.file.filename);
  res.json({
    success: true,
    message: 'Image uploaded successfully',
    filename: req.file.filename,
    imageUrl,
  });
});

// Domain Mount Points
app.use('/api/admin', adminRoutes);
app.use('/api/customer', customerRoutes);

// Global Error Handler
app.use(errorHandler);

const PORT = parseInt(env.PORT, 10) || 5000;

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Backend live: Restaurant System Backend API is active and listening on port ${PORT} (0.0.0.0)`);
  console.log(`🔌 Socket.io server initialized and listening for events`);
  console.log(`📁 Public media uploads route: ${env.BASE_URL}/uploads`);
  console.log(`📷 Standalone upload endpoint: ${env.BASE_URL}/api/upload`);
  console.log(`💻 Admin API base route: ${env.BASE_URL}/api/admin`);
  console.log(`📱 Customer API base route: ${env.BASE_URL}/api/customer`);

  // Verify Database Connection on startup
  await checkDatabaseConnection();
});
