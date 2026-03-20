// src/modules/users/users.controller.ts

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';

// Guards & Decorators
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

// Entities
import { UserRole } from 'src/database/entities/user.entity';

// DTOs
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

// Service
import { UsersService } from './users.service';

@ApiTags('Users')
@UseGuards(JwtAuthGuard) // Tutto il controller richiede JWT
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  // Helper: assicura presenza user
  private ensureUser(user: any) {
    if (!user?.id) {
      throw new UnauthorizedException('Token mancante o non valido');
    }
  }

  // ===========================
  // 🔐 ADMIN ENDPOINTS
  // ===========================

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crea nuovo utente (Admin)' })
  async createUser(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lista tutti gli utenti (Admin)' })
  async findAll() {
    return this.usersService.findAll();
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Statistiche utenti base (Admin)' })
  async getUserStats() {
    return this.usersService.getUserStats();
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Dettaglio utente (Admin)' })
  async findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Aggiorna utente (Admin)' })
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Patch(':id/activate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Attiva utente (Admin)' })
  async activate(@Param('id') id: string) {
    await this.usersService.activate(id);
    return { message: 'Utente attivato' };
  }

  @Patch(':id/deactivate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Disattiva utente (Admin)' })
  async deactivate(@Param('id') id: string) {
    await this.usersService.deactivate(id);
    return { message: 'Utente disattivato' };
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Elimina utente (Admin)' })
  async remove(@Param('id') id: string) {
    await this.usersService.remove(id);
    return { message: 'Utente eliminato' };
  }

  // ===========================
  // 👤 USER PROFILE (me/*)
  // ===========================

  @Get('me/profile')
  @ApiOperation({ summary: 'Il mio profilo' })
  async getMyProfile(@CurrentUser() user: any) {
    this.ensureUser(user);
    const fullUser = await this.usersService.findById(user.id);
    if (!fullUser) throw new UnauthorizedException('Utente non trovato');
    return fullUser;
  }

  @Patch('me/profile')
  @ApiOperation({ summary: 'Aggiorna il mio profilo' })
  async updateMyProfile(@CurrentUser() user: any, @Body() updateUserDto: UpdateUserDto) {
    this.ensureUser(user);

    // Utente non può modificare role e isActive
    const { role, isActive, ...allowedUpdates } = updateUserDto;

    return this.usersService.update(user.id, allowedUpdates);
  }

  @Post('me/change-password')
  @ApiOperation({ summary: 'Cambia la mia password (deprecato - usa Supabase Auth)' })
  async changeMyPassword(@CurrentUser() user: any, @Body() _dto: ChangePasswordDto) {
    this.ensureUser(user);
    // Password management is handled by Supabase Auth on the frontend
    return { message: 'Per cambiare la password usa il client Supabase Auth.' };
  }

  // ===========================
  // 🔒 GDPR ENDPOINTS
  // ===========================

  @Get('me/export')
  @ApiOperation({ summary: 'Esporta tutti i miei dati (GDPR)' })
  async exportMyData(@CurrentUser() user: any) {
    this.ensureUser(user);
    const data = await this.usersService.exportUserData(user.id);
    return {
      success: true,
      message: 'Dati esportati con successo',
      ...data,
    };
  }

  @Delete('me/account')
  @ApiOperation({ summary: 'Richiedi eliminazione account (GDPR)' })
  async requestAccountDeletion(@CurrentUser() user: any) {
    this.ensureUser(user);
    const result = await this.usersService.requestAccountDeletion(user.id);
    return {
      success: true,
      ...result,
    };
  }

  @Delete('me/account/immediate')
  @ApiOperation({ summary: 'Elimina account immediatamente (GDPR soft delete)' })
  async deleteAccountImmediately(@CurrentUser() user: any) {
    this.ensureUser(user);
    await this.usersService.softDeleteUser(user.id);
    return {
      success: true,
      message: 'Account eliminato con successo. I tuoi dati sono stati anonimizzati.',
    };
  }
}