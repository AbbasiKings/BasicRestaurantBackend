import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { env } from '../config/config.js';

const uploadDir = path.resolve(process.cwd(), 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const uniqueName = `img_${Date.now()}_${Math.floor(Math.random() * 10000)}${ext}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (
  req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/octet-stream', // Allow raw byte streams from mobile HTTP multipart
  ];

  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', ''];

  if (allowedTypes.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, WEBP, and GIF images are allowed.'));
  }
};

const maxSizeBytes = parseInt(env.MAX_FILE_SIZE_MB, 10) * 1024 * 1024;

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: maxSizeBytes },
  fileFilter,
});

export const getImageUrl = (filename: string): string => {
  return `${env.BASE_URL}/uploads/${filename}`;
};
