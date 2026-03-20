import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import * as FileType from 'file-type';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

export interface UploadResult {
  filename: string;
  originalName: string;
  size: number;
  mimetype: string;
  url: string;
  thumbnailUrl?: string;
}

export interface ImageProcessingOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  createThumbnail?: boolean;
  thumbnailSize?: number;
}

@Injectable()
export class FileUploadService {
  private readonly logger = new Logger(FileUploadService.name);
  private readonly uploadDir: string;
  private readonly baseUrl: string;
  private readonly allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ];
  private readonly maxFileSize = 5 * 1024 * 1024; // 5MB

  // S3 Configuration
  private readonly s3Client: S3Client;
  private readonly s3Bucket: string;
  private readonly s3Region: string;
  private readonly useS3: boolean;

  constructor(private configService: ConfigService) {
    this.uploadDir = path.join(process.cwd(), 'uploads');

    // S3 Configuration
    this.s3Region = this.configService.get<string>('AWS_REGION', 'eu-central-1');
    this.s3Bucket = this.configService.get<string>('AWS_S3_BUCKET_IMAGES', 'haraldicafirenze-product-images');
    this.useS3 = this.configService.get<string>('NODE_ENV') !== 'development' ||
                  this.configService.get<boolean>('USE_S3_LOCALLY', false);

    // Initialize S3 client (IAM role if no explicit keys)
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    const s3ClientConfig = {
      region: this.s3Region,
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    };

    this.s3Client = new S3Client(s3ClientConfig);
    this.logger.log(`✅ S3 Client initialized: Bucket=${this.s3Bucket}, Region=${this.s3Region}`);

    // Base URL for images
    if (this.useS3 && this.s3Client) {
      this.baseUrl = `https://${this.s3Bucket}.s3.${this.s3Region}.amazonaws.com`;
      this.logger.log(`📦 Storage mode: S3 (${this.s3Bucket})`);
    } else {
      const backendUrl = this.configService.get('app.backendUrl') ||
                         `http://localhost:${this.configService.get('app.port', 3000)}`;
      this.baseUrl = backendUrl;
      this.logger.log(`📁 Storage mode: Local filesystem`);
    }

    this.ensureUploadDirectories();
  }

  private ensureUploadDirectories() {
    const directories = [
      this.uploadDir,
      path.join(this.uploadDir, 'products'),
      path.join(this.uploadDir, 'products', 'thumbnails'),
      path.join(this.uploadDir, 'avatars'),
      path.join(this.uploadDir, 'avatars', 'thumbnails'),
      path.join(this.uploadDir, 'temp')
    ];

    directories.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        this.logger.log(`Directory creata: ${dir}`);
      }
    });
  }

  async uploadProductImage(
    file: Express.Multer.File,
    options: ImageProcessingOptions = {}
  ): Promise<UploadResult> {
    await this.validateFile(file);

    const filename = this.generateFilename(file.originalname);

    try {
      // Processa l'immagine
      const processedImage = await this.processImage(file.buffer, {
        width: options.width || 800,
        height: options.height || 800,
        quality: options.quality || 85,
        format: options.format || 'webp',
        createThumbnail: true,
        thumbnailSize: 200,
        ...options,
      });

      let url: string;
      let thumbnailUrl: string | undefined;

      if (this.useS3 && this.s3Client) {
        // Upload to S3
        url = await this.uploadToS3(processedImage.main, `products/${filename}`, 'image/webp');

        if (processedImage.thumbnail) {
          thumbnailUrl = await this.uploadToS3(
            processedImage.thumbnail,
            `products/thumbnails/${filename}`,
            'image/webp'
          );
        }
      } else {
        // Save locally
        const productDir = path.join(this.uploadDir, 'products');
        const filePath = path.join(productDir, filename);

        await sharp(processedImage.main).toFile(filePath);
        url = `${this.baseUrl}/uploads/products/${filename}`;

        if (processedImage.thumbnail) {
          const thumbnailPath = path.join(productDir, 'thumbnails', filename);
          await sharp(processedImage.thumbnail).toFile(thumbnailPath);
          thumbnailUrl = `${this.baseUrl}/uploads/products/thumbnails/${filename}`;
        }
      }

      const result: UploadResult = {
        filename,
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        url,
        thumbnailUrl,
      };

      this.logger.log(`✅ Immagine prodotto caricata: ${filename} → ${url}`);
      return result;

    } catch (error) {
      this.logger.error('Errore upload immagine prodotto:', error);
      throw new BadRequestException('Errore durante l\'elaborazione dell\'immagine');
    }
  }

  async uploadAvatar(
    file: Express.Multer.File,
    userId: string
  ): Promise<UploadResult> {
    await this.validateFile(file);

    const filename = `avatar-${userId}-${Date.now()}.webp`;

    try {
      // Processa avatar (quadrato, piccolo)
      const processedImage = await this.processImage(file.buffer, {
        width: 200,
        height: 200,
        quality: 90,
        format: 'webp',
        createThumbnail: true,
        thumbnailSize: 64,
      });

      let url: string;
      let thumbnailUrl: string;

      if (this.useS3 && this.s3Client) {
        // Upload to S3
        url = await this.uploadToS3(processedImage.main, `avatars/${filename}`, 'image/webp');
        thumbnailUrl = await this.uploadToS3(
          processedImage.thumbnail!,
          `avatars/thumbnails/${filename}`,
          'image/webp'
        );
      } else {
        // Save locally
        const avatarDir = path.join(this.uploadDir, 'avatars');
        const filePath = path.join(avatarDir, filename);

        await sharp(processedImage.main).toFile(filePath);
        url = `${this.baseUrl}/uploads/avatars/${filename}`;

        const thumbnailPath = path.join(avatarDir, 'thumbnails', filename);
        await sharp(processedImage.thumbnail!).toFile(thumbnailPath);
        thumbnailUrl = `${this.baseUrl}/uploads/avatars/thumbnails/${filename}`;
      }

      const result: UploadResult = {
        filename,
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        url,
        thumbnailUrl,
      };

      this.logger.log(`✅ Avatar caricato per user ${userId}: ${filename}`);
      return result;

    } catch (error) {
      this.logger.error('Errore upload avatar:', error);
      throw new BadRequestException('Errore durante l\'elaborazione dell\'avatar');
    }
  }

  async uploadMultipleProductImages(
    files: Express.Multer.File[],
    options: ImageProcessingOptions = {}
  ): Promise<UploadResult[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('Nessun file fornito');
    }

    if (files.length > 10) {
      throw new BadRequestException('Massimo 10 immagini per prodotto');
    }

    const results: UploadResult[] = [];

    for (const file of files) {
      try {
        const result = await this.uploadProductImage(file, options);
        results.push(result);
      } catch (error) {
        this.logger.error(`Errore upload ${file.originalname}:`, error);
        // Continua con gli altri file
      }
    }

    return results;
  }

  async deleteFile(filePath: string): Promise<boolean> {
    try {
      // Check if it's an S3 URL
      if (filePath.includes('s3.') && filePath.includes('amazonaws.com')) {
        return await this.deleteFromS3(filePath);
      }

      // Local file deletion
      const fullPath = path.join(this.uploadDir, filePath);

      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);

        // Elimina anche thumbnail se esiste
        const thumbnailPath = fullPath.replace('/products/', '/products/thumbnails/');
        if (fs.existsSync(thumbnailPath)) {
          fs.unlinkSync(thumbnailPath);
        }

        this.logger.log(`File eliminato: ${filePath}`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Errore eliminazione file ${filePath}:`, error);
      return false;
    }
  }

  async deleteMultipleFiles(filePaths: string[]): Promise<{ deleted: number; errors: number }> {
    let deleted = 0;
    let errors = 0;

    for (const filePath of filePaths) {
      const success = await this.deleteFile(filePath);
      if (success) {
        deleted++;
      } else {
        errors++;
      }
    }

    return { deleted, errors };
  }

  async optimizeExistingImages(): Promise<{ processed: number; errors: number }> {
    let processed = 0;
    let errors = 0;

    try {
      const productsDir = path.join(this.uploadDir, 'products');
      const files = fs.readdirSync(productsDir);

      for (const filename of files) {
        if (this.isImageFile(filename)) {
          try {
            const filePath = path.join(productsDir, filename);
            const buffer = fs.readFileSync(filePath);

            const optimized = await sharp(buffer)
              .webp({ quality: 85 })
              .toBuffer();

            fs.writeFileSync(filePath, optimized);
            processed++;

          } catch (error) {
            this.logger.error(`Errore ottimizzazione ${filename}:`, error);
            errors++;
          }
        }
      }

      this.logger.log(`Ottimizzazione completata: ${processed} successi, ${errors} errori`);
    } catch (error) {
      this.logger.error('Errore ottimizzazione batch:', error);
    }

    return { processed, errors };
  }

  getUploadStats(): {
    totalFiles: number;
    totalSize: number;
    productImages: number;
    avatars: number;
    storageMode: string;
  } {
    const stats = {
      totalFiles: 0,
      totalSize: 0,
      productImages: 0,
      avatars: 0,
      storageMode: this.useS3 ? `S3 (${this.s3Bucket})` : 'Local filesystem',
    };

    try {
      // Conta immagini prodotti (solo per local)
      if (!this.useS3) {
        const productsDir = path.join(this.uploadDir, 'products');
        if (fs.existsSync(productsDir)) {
          const productFiles = fs.readdirSync(productsDir);
          stats.productImages = productFiles.filter(f => this.isImageFile(f)).length;

          productFiles.forEach(filename => {
            const filePath = path.join(productsDir, filename);
            if (fs.statSync(filePath).isFile()) {
              stats.totalFiles++;
              stats.totalSize += fs.statSync(filePath).size;
            }
          });
        }

        // Conta avatar
        const avatarsDir = path.join(this.uploadDir, 'avatars');
        if (fs.existsSync(avatarsDir)) {
          const avatarFiles = fs.readdirSync(avatarsDir);
          stats.avatars = avatarFiles.filter(f => this.isImageFile(f)).length;
        }
      }

    } catch (error) {
      this.logger.error('Errore calcolo statistiche upload:', error);
    }

    return stats;
  }

  // ==================== S3 Methods ====================

  private async uploadToS3(buffer: Buffer, key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.s3Bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000', // 1 year cache
    });

    await this.s3Client.send(command);

    const url = `https://${this.s3Bucket}.s3.${this.s3Region}.amazonaws.com/${key}`;
    this.logger.log(`📤 [S3] Uploaded: ${key}`);

    return url;
  }

  private async deleteFromS3(s3Url: string): Promise<boolean> {
    try {
      // Extract key from S3 URL
      const key = s3Url.split('.amazonaws.com/')[1];

      if (!key) {
        this.logger.warn(`Invalid S3 URL for deletion: ${s3Url}`);
        return false;
      }

      const command = new DeleteObjectCommand({
        Bucket: this.s3Bucket,
        Key: key,
      });

      await this.s3Client.send(command);

      // Also delete thumbnail if it's a product image
      if (key.startsWith('products/') && !key.includes('thumbnails')) {
        const thumbnailKey = key.replace('products/', 'products/thumbnails/');
        try {
          await this.s3Client.send(new DeleteObjectCommand({
            Bucket: this.s3Bucket,
            Key: thumbnailKey,
          }));
        } catch (e) {
          // Thumbnail might not exist, ignore
        }
      }

      this.logger.log(`🗑️ [S3] Deleted: ${key}`);
      return true;
    } catch (error) {
      this.logger.error(`❌ [S3] Delete failed:`, error);
      return false;
    }
  }

  // ==================== Validation & Processing ====================

  private async validateFile(file: Express.Multer.File): Promise<void> {
    if (!file) {
      throw new BadRequestException('File mancante');
    }

    // Validazione MIME type header
    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Tipo file non supportato. Supportati: JPEG, PNG, WebP, GIF');
    }

    if (file.size > this.maxFileSize) {
      throw new BadRequestException(`File troppo grande. Massimo ${this.maxFileSize / 1024 / 1024}MB`);
    }

    // Validazione magic bytes (prevenzione spoofing)
    try {
      const fileType = await FileType.fromBuffer(file.buffer);

      if (!fileType) {
        throw new BadRequestException('Impossibile determinare il tipo di file');
      }

      const allowedMimeTypesSet = new Set(this.allowedMimeTypes);
      if (!allowedMimeTypesSet.has(fileType.mime)) {
        throw new BadRequestException(
          `Tipo file reale non valido. Rilevato: ${fileType.mime}. Header dichiarato: ${file.mimetype}`
        );
      }

      this.logger.log(`File validato: ${fileType.mime} (size: ${file.size} bytes)`);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('Errore validazione magic bytes:', error);
      throw new BadRequestException('Errore durante la validazione del file');
    }
  }

  private async processImage(
    buffer: Buffer,
    options: ImageProcessingOptions
  ): Promise<{ main: Buffer; thumbnail?: Buffer }> {
    let pipeline = sharp(buffer);

    // Resize se necessario
    if (options.width || options.height) {
      pipeline = pipeline.resize(options.width, options.height, {
        fit: 'cover',
        position: 'center',
      });
    }

    // Formato e qualità
    switch (options.format) {
      case 'jpeg':
        pipeline = pipeline.jpeg({ quality: options.quality || 85 });
        break;
      case 'png':
        pipeline = pipeline.png({ quality: options.quality || 85 });
        break;
      case 'webp':
      default:
        pipeline = pipeline.webp({ quality: options.quality || 85 });
        break;
    }

    const main = await pipeline.toBuffer();

    let thumbnail: Buffer | undefined;
    if (options.createThumbnail && options.thumbnailSize) {
      thumbnail = await sharp(buffer)
        .resize(options.thumbnailSize, options.thumbnailSize, {
          fit: 'cover',
          position: 'center',
        })
        .webp({ quality: 80 })
        .toBuffer();
    }

    return { main, thumbnail };
  }

  private generateFilename(originalName: string): string {
    const timestamp = Date.now();
    const uuid = uuidv4().substring(0, 8);
    return `${timestamp}-${uuid}.webp`; // Forza sempre WebP
  }

  private isImageFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
  }
}
