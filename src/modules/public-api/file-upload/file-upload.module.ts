import { Module, forwardRef } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { FileUploadController } from './file-upload.controller';
import { FileUploadService } from './file-upload.service';
import { multerConfig } from './multer.config';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MulterModule.register(multerConfig),
    forwardRef(() => AuthModule),
  ],
  controllers: [FileUploadController],
  providers: [FileUploadService],
  exports: [FileUploadService],
})
export class FileUploadModule {}