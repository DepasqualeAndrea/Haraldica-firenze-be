import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import * as FileType from 'file-type';

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

  // Supabase Storage Configuration
  private readonly supabase: SupabaseClient;
  private readonly storageBucket: string;
  private readonly useSupabaseStorage: boolean;

  constructor(private configService: ConfigService) {
    this.uploadDir = path.join(process.cwd(), 'uploads');

    // Supabase Configuration
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseServiceKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    this.storageBucket = this.configService.get<string>('SUPABASE_STORAGE_BUCKET', 'product-images');
    this.useSupabaseStorage = this.configService.get<string>('NODE_ENV') !== 'development' ||
                              this.configService.get<boolean>('USE_SUPABASE_STORAGE_LOCALLY', true);

    // Initialize Supabase client
    if (supabaseUrl && supabaseServiceKey) {
      this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });
      this.logger.log(`✅ Supabase Storage initialized: Bucket=${this.storageBucket}`);
    }

    // Base URL for images
    if (this.useSupabaseStorage && this.supabase) {
      this.baseUrl = `${supabaseUrl}/storage/v1/object/public/${this.storageBucket}`;
      this.logger.log(`📦 Storage mode: Supabase (${this.storageBucket})`);
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
        width: options.width || 1200,
        height: options.height || 1600,
        quality: options.quality || 90,
        format: options.format || 'webp',
        createThumbnail: false,
        ...options,
      });

      let url: string;
      let thumbnailUrl: string | undefined;

      if (this.useSupabaseStorage && this.supabase) {
        // Upload to Supabase Storage
        url = await this.uploadToSupabase(processedImage.main, `products/${filename}`, 'image/webp');

        if (processedImage.thumbnail) {
          thumbnailUrl = await this.uploadToSupabase(
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

      if (this.useSupabaseStorage && this.supabase) {
        // Upload to Supabase Storage
        url = await this.uploadToSupabase(processedImage.main, `avatars/${filename}`, 'image/webp');
        thumbnailUrl = await this.uploadToSupabase(
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
  ): Promise<{ urls: string[]; results: UploadResult[] }> {
    if (!files || files.length === 0) {
      throw new BadRequestException('Nessun file fornito');
    }

    if (files.length > 10) {
      throw new BadRequestException('Massimo 10 immagini per volta');
    }

    const results: UploadResult[] = [];
    const urls: string[] = [];

    for (const file of files) {
      try {
        const result = await this.uploadProductImage(file, options);
        results.push(result);
        urls.push(result.url);
      } catch (error) {
        this.logger.error(`Errore upload ${file.originalname}:`, error);
        // Continua con gli altri file
      }
    }

    return { urls, results };
  }

  async deleteFile(filePath: string): Promise<boolean> {
    try {
      // Check if it's a Supabase URL
      if (filePath.includes('/storage/v1/object/public/')) {
        return await this.deleteFromSupabase(filePath);
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
      storageMode: this.useSupabaseStorage ? `Supabase (${this.storageBucket})` : 'Local filesystem',
    };

    try {
      // Conta immagini prodotti (solo per local)
      if (!this.useSupabaseStorage) {
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

  // ==================== Supabase Storage Methods ====================

  private async uploadToSupabase(buffer: Buffer, filePath: string, contentType: string): Promise<string> {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.storageBucket)
        .upload(filePath, buffer, {
          contentType,
          cacheControl: '31536000', // 1 year
          upsert: true // Sovrascrive se esiste già
        });

      if (error) {
        this.logger.error(`Errore upload Supabase:`, error);
        throw new BadRequestException(`Errore upload: ${error.message}`);
      }

      const url = `${this.baseUrl}/${data.path}`;
      this.logger.log(`📤 [Supabase] Uploaded: ${filePath} → ${url}`);

      return url;
    } catch (error) {
      this.logger.error('Errore upload to Supabase:', error);
      throw new BadRequestException('Errore durante l\'upload su Supabase Storage');
    }
  }

  private async deleteFromSupabase(supabaseUrl: string): Promise<boolean> {
    try {
      // Extract path from Supabase URL
      // Format: https://xxx.supabase.co/storage/v1/object/public/product-images/products/filename.webp
      const pathMatch = supabaseUrl.match(/\/public\/[^/]+\/(.+)/);

      if (!pathMatch || !pathMatch[1]) {
        this.logger.warn(`Invalid Supabase URL for deletion: ${supabaseUrl}`);
        return false;
      }

      const filePath = pathMatch[1];

      const { error } = await this.supabase.storage
        .from(this.storageBucket)
        .remove([filePath]);

      if (error) {
        this.logger.error(`Errore eliminazione Supabase:`, error);
        return false;
      }

      // Also delete thumbnail if it's a product image
      if (filePath.startsWith('products/') && !filePath.includes('thumbnails')) {
        const thumbnailPath = filePath.replace('products/', 'products/thumbnails/');
        try {
          await this.supabase.storage
            .from(this.storageBucket)
            .remove([thumbnailPath]);
        } catch (e) {
          // Thumbnail might not exist, ignore
        }
      }

      this.logger.log(`🗑️ [Supabase] Deleted: ${filePath}`);
      return true;
    } catch (error) {
      this.logger.error(`❌ [Supabase] Delete failed:`, error);
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
        fit: 'inside',          // mantiene le proporzioni originali senza tagliare
        withoutEnlargement: true, // non ingrandisce se l'immagine è già piccola
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
