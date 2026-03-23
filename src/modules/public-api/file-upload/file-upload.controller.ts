import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileUploadService } from './file-upload.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { RequireAdmin, RequireAuth } from 'src/common/guards/flexible-auth.guard';

@ApiTags('file-upload')
@Controller('upload')
export class FileUploadController {
  constructor(private fileUploadService: FileUploadService) {}

  @Post('product-image')
  @RequireAdmin()
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('image'))
  @ApiOperation({ summary: 'Upload immagine prodotto (Admin)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async uploadProductImage(
    @UploadedFile() file: Express.Multer.File,
    @Query('width') width?: number,
    @Query('height') height?: number,
    @Query('quality') quality?: number,
  ) {
    if (!file) {
      throw new BadRequestException('File immagine richiesto');
    }

    const options = {
      width: width ? parseInt(width.toString()) : undefined,
      height: height ? parseInt(height.toString()) : undefined,
      quality: quality ? parseInt(quality.toString()) : undefined,
    };

    return this.fileUploadService.uploadProductImage(file, options);
  }

  @Post('product-images')
  @RequireAdmin()
  @ApiBearerAuth()
  @UseInterceptors(FilesInterceptor('images', 10))
  @ApiOperation({ summary: 'Upload multiple immagini prodotto (Admin)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        images: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
      },
    },
  })
  async uploadMultipleProductImages(
    @UploadedFiles() files: Express.Multer.File[],
    @Query('width') width?: number,
    @Query('height') height?: number,
    @Query('quality') quality?: number,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Almeno un file immagine richiesto');
    }

    const options = {
      width: width ? parseInt(width.toString()) : undefined,
      height: height ? parseInt(height.toString()) : undefined,
      quality: quality ? parseInt(quality.toString()) : undefined,
    };

    return this.fileUploadService.uploadMultipleProductImages(files, options);
  }

  @Post('avatar')
  @RequireAuth()
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiOperation({ summary: 'Upload avatar utente' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        avatar: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async uploadAvatar(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File avatar richiesto');
    }

    return this.fileUploadService.uploadAvatar(file, user.id);
  }

  @Delete('file')
  @RequireAdmin()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Elimina file (Admin)' })
  async deleteFile(@Query('filepath') filepath: string) {
    if (!filepath) {
      throw new BadRequestException('Filepath richiesto');
    }

    const success = await this.fileUploadService.deleteFile(filepath);

    if (success) {
      return { message: 'File eliminato con successo' };
    } else {
      throw new BadRequestException('File non trovato o errore eliminazione');
    }
  }

  @Post('optimize')
  @RequireAdmin()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ottimizza immagini esistenti (Admin)' })
  async optimizeImages() {
    const result = await this.fileUploadService.optimizeExistingImages();

    return {
      message: 'Ottimizzazione completata',
      processed: result.processed,
      errors: result.errors,
    };
  }

  @Get('stats')
  @RequireAdmin()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Statistiche upload (Admin)' })
  async getUploadStats() {
    return this.fileUploadService.getUploadStats();
  }
}
