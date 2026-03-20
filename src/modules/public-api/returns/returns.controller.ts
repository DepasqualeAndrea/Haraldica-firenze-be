import {
    Controller,
    Get,
    Post,
    Put,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    Request,
    UploadedFiles,
    UseInterceptors,
    BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ReturnsService } from './returns.service';
import { FlexibleAuthGuard, RequireAuth, RequirePermission } from '../../../common/guards/flexible-auth.guard';
import { InspectionResultDto, ProcessRefundDto } from './dto/inspection-result.dto';
import { ReturnFilterDto } from './dto/return-filter.dto';
import { FileUploadService } from '../file-upload/file-upload.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { CancelReturnDto, UpdateReturnStatusDto, RequestAdditionalInfoDto } from './dto/update-return-status.dto';

@Controller('returns')
@UseGuards(FlexibleAuthGuard)
export class ReturnsController {
    constructor(
        private readonly returnsService: ReturnsService,
        private readonly fileUploadService: FileUploadService,
    ) { }

    // ===========================
    // CUSTOMER ENDPOINTS
    // ===========================

    @Post()
    @RequireAuth()
    async createReturn(@Request() req, @Body() dto: CreateReturnDto) {
        const userId = req.user.id;
        const returnEntity = await this.returnsService.createReturn(dto, userId);

        return {
            success: true,
            message: 'Richiesta di reso creata con successo',
            return: returnEntity,
        };
    }

    @Get('my')
    @RequireAuth()
    async getMyReturns(@Request() req, @Query() filter: ReturnFilterDto) {
        const userId = req.user.id;
        const { returns, total } = await this.returnsService.getMyReturns(userId, filter);

        return {
            success: true,
            returns,
            pagination: {
                total,
                page: filter.page || 1,
                limit: filter.limit || 20,
                totalPages: Math.ceil(total / (filter.limit || 20)),
            },
        };
    }

    @Get('my/:id')
    @RequireAuth()
    async getMyReturn(@Request() req, @Param('id') id: string) {
        const userId = req.user.id;
        const returnEntity = await this.returnsService.getReturnById(id, userId);

        return {
            success: true,
            return: returnEntity,
        };
    }

    @Post('my/:id/cancel')
    @RequireAuth()
    async cancelMyReturn(
        @Request() req,
        @Param('id') id: string,
        @Body() dto: CancelReturnDto
    ) {
        const userId = req.user.id;
        const returnEntity = await this.returnsService.cancelReturn(id, dto, userId, false);

        return {
            success: true,
            message: 'Reso annullato con successo',
            return: returnEntity,
        };
    }

    @Post('upload-photos')
    @RequireAuth()
    @UseInterceptors(FilesInterceptor('photos', 5))
    async uploadReturnPhotos(@UploadedFiles() files: Express.Multer.File[]) {
        if (!files || files.length === 0) {
            throw new BadRequestException('Nessun file caricato');
        }

        const uploadedPhotos: string[] = [];

        for (const file of files) {
            const result = await this.fileUploadService.uploadProductImage(file, {
                width: 1200,
                height: 1200,
                quality: 90,
                createThumbnail: true,
                thumbnailSize: 300,
            });

            uploadedPhotos.push(result.url);
        }

        return {
            success: true,
            photos: uploadedPhotos,
            message: `${uploadedPhotos.length} foto caricate con successo`,
        };
    }

    // ===========================
    // ADMIN ENDPOINTS
    // ===========================

    @Get('admin/all')
    @RequirePermission('admin_only')
    async getAllReturns(@Query() filter: ReturnFilterDto) {
        const { returns, total } = await this.returnsService.getAllReturns(filter);

        return {
            success: true,
            returns,
            pagination: {
                total,
                page: filter.page || 1,
                limit: filter.limit || 20,
                totalPages: Math.ceil(total / (filter.limit || 20)),
            },
        };
    }

    @Get('admin/:id')
    @RequirePermission('admin_only')
    async getReturnAdmin(@Param('id') id: string) {
        const returnEntity = await this.returnsService.getReturnByIdAdmin(id);

        return {
            success: true,
            return: returnEntity,
        };
    }

    @Patch('admin/:id/status')
    @RequirePermission('admin_only')
    async updateReturnStatus(
        @Request() req,
        @Param('id') id: string,
        @Body() dto: UpdateReturnStatusDto
    ) {
        const adminId = req.user.id;
        const returnEntity = await this.returnsService.updateReturnStatus(id, dto, adminId);

        return {
            success: true,
            message: 'Stato reso aggiornato con successo',
            return: returnEntity,
        };
    }

    @Post('admin/:id/request-info')
    @RequirePermission('admin_only')
    async requestAdditionalInfo(
        @Request() req,
        @Param('id') id: string,
        @Body() dto: RequestAdditionalInfoDto
    ) {
        const adminId = req.user.id;
        const returnEntity = await this.returnsService.requestAdditionalInfo(id, dto, adminId);

        return {
            success: true,
            message: 'Richiesta informazioni inviata',
            return: returnEntity,
        };
    }

    @Post('admin/:id/cancel')
    @RequirePermission('admin_only')
    async cancelReturnAdmin(
        @Request() req,
        @Param('id') id: string,
        @Body() dto: CancelReturnDto
    ) {
        const adminId = req.user.id;
        const returnEntity = await this.returnsService.cancelReturn(id, dto, adminId, true);

        return {
            success: true,
            message: 'Reso annullato',
            return: returnEntity,
        };
    }

    @Post('admin/:id/inspect')
    @RequirePermission('admin_only')
    async submitInspection(
        @Request() req,
        @Param('id') id: string,
        @Body() dto: InspectionResultDto
    ) {
        const adminId = req.user.id;
        const returnEntity = await this.returnsService.submitInspection(id, dto, adminId);

        return {
            success: true,
            message: 'Ispezione completata',
            return: returnEntity,
        };
    }

    @Post('admin/:id/refund')
    @RequirePermission('admin_only')
    async processRefund(
        @Request() req,
        @Param('id') id: string,
        @Body() dto: ProcessRefundDto
    ) {
        const adminId = req.user.id;
        const returnEntity = await this.returnsService.processRefund(id, dto, adminId);

        return {
            success: true,
            message: `Rimborso di €${returnEntity.refundAmount.toFixed(2)} effettuato con successo`,
            return: returnEntity,
        };
    }

    @Post('admin/upload-inspection-photos')
    @RequirePermission('admin_only')
    @UseInterceptors(FilesInterceptor('photos', 10))
    async uploadInspectionPhotos(@UploadedFiles() files: Express.Multer.File[]) {
        if (!files || files.length === 0) {
            throw new BadRequestException('Nessun file caricato');
        }

        const uploadedPhotos: string[] = [];

        for (const file of files) {
            const result = await this.fileUploadService.uploadProductImage(file, {
                width: 1600,
                height: 1600,
                quality: 95,
                createThumbnail: true,
                thumbnailSize: 400,
            });

            uploadedPhotos.push(result.url);
        }

        return {
            success: true,
            photos: uploadedPhotos,
            message: `${uploadedPhotos.length} foto controllo qualità caricate`,
        };
    }

    // ===========================
    // STATS & REPORTS (Admin)
    // ===========================

    @Get('admin/stats/summary')
    @RequirePermission('admin_only')
    async getReturnsSummary() {
        // TODO: Implementare statistiche aggregate
        return {
            success: true,
            stats: {
                totalReturns: 0,
                pendingReview: 0,
                approved: 0,
                rejected: 0,
                totalRefunded: 0,
            },
        };
    }
}