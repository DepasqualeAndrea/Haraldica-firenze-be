// src/modules/public-api/brt/s3/s3.service.ts

import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly region: string;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>('AWS_REGION', 'eu-central-1');
    this.bucketName = this.configService.get<string>('AWS_S3_BUCKET_LABELS', 'haraldicafirenze-brt-labels');

    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

    this.s3Client = new S3Client({
      region: this.region,
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });

    this.logger.log(`✅ S3 Service initialized: Bucket=${this.bucketName}, Region=${this.region}`);
  }

  /**
   * Upload etichetta PDF BRT su S3
   * @param base64Data - Stream Base64 dell'etichetta da BRT API
   * @param orderNumber - Numero ordine (es: MRV20251204001)
   * @param parcelID - BRT Parcel ID (es: 102151040123456789)
   * @returns S3 URL dell'etichetta caricata
   */
  async uploadBrtLabel(
    base64Data: string,
    orderNumber: string,
    parcelID: string,
  ): Promise<string> {
    try {
      const startTime = Date.now();
      
      const buffer = Buffer.from(base64Data, 'base64');

      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const key = `labels/${year}/${month}/${orderNumber}_${parcelID}.pdf`;

      this.logger.log(`📤 [S3] Uploading label: ${key} (${Math.round(buffer.length / 1024)} KB)`);

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: 'application/pdf',
        ContentDisposition: `attachment; filename="${orderNumber}_label.pdf"`,
        Metadata: {
          orderNumber,
          parcelID,
          uploadedAt: new Date().toISOString(),
        },
      });

      await this.s3Client.send(command);

      const elapsed = Date.now() - startTime;
      const s3Url = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;

      this.logger.log(`✅ [S3] Label uploaded successfully (${elapsed}ms): ${s3Url}`);

      return s3Url;
    } catch (error: any) {
      this.logger.error(`❌ [S3] Upload failed:`, error.message);
      throw new InternalServerErrorException(
        `Failed to upload label to S3: ${error.message}`,
      );
    }
  }

  /**
   * Genera URL firmato per download etichetta (valido 1 ora)
   * @param s3Url - URL S3 completo dell'etichetta
   * @returns URL firmato temporaneo
   */
  async getSignedDownloadUrl(s3Url: string): Promise<string> {
    try {
      // Estrai key dall'URL S3
      const key = s3Url.split('.amazonaws.com/')[1];

      if (!key) {
        throw new Error('Invalid S3 URL');
      }

      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      // URL firmato valido 1 ora
      const signedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: 3600, // 1 ora
      });

      this.logger.log(`🔗 [S3] Signed URL generated: ${key}`);

      return signedUrl;
    } catch (error: any) {
      this.logger.error(`❌ [S3] Failed to generate signed URL:`, error.message);
      throw new InternalServerErrorException(
        `Failed to generate download URL: ${error.message}`,
      );
    }
  }

  /**
   * Elimina etichetta da S3
   * @param s3Url - URL S3 completo dell'etichetta
   */
  async deleteBrtLabel(s3Url: string): Promise<void> {
    try {
      // Estrai key dall'URL S3
      const key = s3Url.split('.amazonaws.com/')[1];

      if (!key) {
        throw new Error('Invalid S3 URL');
      }

      this.logger.log(`🗑️ [S3] Deleting label: ${key}`);

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);

      this.logger.log(`✅ [S3] Label deleted: ${key}`);
    } catch (error: any) {
      this.logger.error(`❌ [S3] Failed to delete label:`, error.message);
      throw new InternalServerErrorException(
        `Failed to delete label from S3: ${error.message}`,
      );
    }
  }

  /**
   * Verifica se etichetta esiste su S3
   * @param s3Url - URL S3 completo dell'etichetta
   * @returns true se esiste, false altrimenti
   */
  async labelExists(s3Url: string): Promise<boolean> {
    try {
      const key = s3Url.split('.amazonaws.com/')[1];

      if (!key) {
        return false;
      }

      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }
}