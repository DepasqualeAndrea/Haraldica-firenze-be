import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { BadRequestException } from '@nestjs/common';

export const multerConfig: MulterOptions = {
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 10, // Massimo 10 file per upload
  },
  fileFilter: (req, file, callback) => {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/webp',
      'image/gif'
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(
        new BadRequestException(
          'Tipo file non supportato. Supportati: JPEG, PNG, WebP, GIF'
        ),
        false
      );
    }
  },
  // Usa memoria invece di filesystem per processing con Sharp
  storage: undefined, // Usa memory storage di default
};