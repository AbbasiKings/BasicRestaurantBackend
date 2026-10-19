import multer from 'multer';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/config.js';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

const storage = multer.memoryStorage();

const fileFilter = (req: any, file: any, cb: any) => {
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/octet-stream',
  ];

  const ext = path.extname(file.originalname || '').toLowerCase();
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

export async function uploadToCloudinary(fileBuffer: Buffer): Promise<string> {
  const uniqueName = `img_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'restaurant_uploads',
        public_id: uniqueName,
        resource_type: 'image',
      },
      (error, result) => {
        if (error) {
          console.error('[Cloudinary] Upload failed:', error);
          return reject(error);
        }
        if (!result || !result.secure_url) {
          return reject(new Error('Failed to retrieve secure URL from Cloudinary'));
        }
        resolve(result.secure_url);
      }
    );

    uploadStream.end(fileBuffer);
  });
}

export async function deleteCloudinaryFile(imageUrl: string | null | undefined): Promise<void> {
  if (!imageUrl) return;

  try {
    if (imageUrl.includes('res.cloudinary.com')) {
      const urlParts = imageUrl.split('/upload/');
      if (urlParts.length > 1) {
        const pathWithVersion = urlParts[1];
        const withoutVersion = pathWithVersion.replace(/^v\d+\//, '');
        const publicId = withoutVersion.substring(0, withoutVersion.lastIndexOf('.'));

        if (publicId) {
          await cloudinary.uploader.destroy(publicId);
          console.log(`[Cloudinary] Successfully deleted old image: ${publicId}`);
        }
      }
    }
  } catch (err) {
    console.warn('[Cloudinary] Failed to delete old upload file:', err);
  }
}
