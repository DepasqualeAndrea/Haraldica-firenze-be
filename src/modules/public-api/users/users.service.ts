// src/modules/public-api/users/users.service.ts

import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  forwardRef,
  Inject,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';

// Entities
import { User, UserRole } from 'src/database/entities/user.entity';
import { Cart } from 'src/database/entities/cart.entity';
import { Wishlist } from 'src/database/entities/wishlist.entity';
import { Review } from 'src/database/entities/review.entity';
import { Address } from 'src/database/entities/address.entity';
import { Consent } from 'src/database/entities/consent.entity';

// Services
import { OrdersService } from '../orders/orders.service';
import { StripeService } from '../payments/stripe.service';
import { CartService } from '../cart/cart.service';
import { EmailService } from '../notifications/email.service';

// Utils
import { PasswordUtil } from 'src/utils/password.util';

// DTOs
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Order, OrderStatus } from 'src/database/entities/order.entity';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @Inject(forwardRef(() => OrdersService))
    private ordersService: OrdersService,
    @Inject(forwardRef(() => StripeService))
    private stripeService: StripeService,
    @Inject(forwardRef(() => CartService))
    private cartService: CartService,
    private dataSource: DataSource,
    @Inject(forwardRef(() => EmailService))
    private emailService: EmailService,
  ) { }

  // ===========================
  // 👤 CRUD BASE USERS
  // ===========================

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existingUser = await this.findByEmail(createUserDto.email);
    if (existingUser) {
      throw new ConflictException('Email già in uso');
    }

    const user = this.userRepository.create(createUserDto);
    const savedUser = await this.userRepository.save(user);

    this.logger.log(`✅ Utente creato: ${savedUser.email} (ID: ${savedUser.id})`);

    return savedUser;
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
      relations: ['addresses'],
    });
  }

  async findBySupabaseId(supabaseId: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { supabaseId },
      relations: ['addresses'],
    });
  }

  async findOrCreateFromSupabase(payload: {
    sub: string;
    email?: string;
    role?: string;
  }): Promise<User> {
    // Try to find by supabaseId first
    let user = await this.findBySupabaseId(payload.sub);
    if (user) return user;

    // Try to find by email (account pre-existing without supabaseId)
    if (payload.email) {
      user = await this.findByEmail(payload.email);
      if (user) {
        await this.userRepository.update(user.id, { supabaseId: payload.sub });
        user.supabaseId = payload.sub;
        return user;
      }
    }

    // Create new user from Supabase payload
    const newUser = this.userRepository.create({
      supabaseId: payload.sub,
      email: payload.email,
      role: UserRole.CUSTOMER,
      isActive: true,
      isEmailVerified: true, // Supabase handles email verification
    });

    const saved = await this.userRepository.save(newUser);
    this.logger.log(`✅ Utente creato da Supabase: ${saved.email} (supabaseId: ${payload.sub})`);
    return saved;
  }

  async findByEmail(email: string): Promise<User | null> {
    if (!email || !email.trim()) {
      return null;
    }

    const normalizedEmail = email.trim().toLowerCase();

    return this.userRepository.findOne({
      where: { email: normalizedEmail },
    });
  }

  async findOneWithPassword(email: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .where('user.email = :email', { email })
      .addSelect('user.password')
      .getOne();
  }

  async findAll(): Promise<User[]> {
    return this.userRepository.find({
      select: ['id', 'email', 'firstName', 'lastName', 'phone', 'role', 'isActive', 'createdAt'],
      order: { createdAt: 'DESC' },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Utente non trovato');
    }

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.findByEmail(updateUserDto.email);
      if (existingUser) {
        throw new ConflictException('Email già in uso');
      }
    }

    Object.assign(user, updateUserDto);
    const updatedUser = await this.userRepository.save(user);

    if (user.stripeCustomerId) {
      this.syncUserToStripe(user.id).catch((err) => {
        this.logger.error(`❌ Errore sync automatico a Stripe: ${err.message}`);
      });
    }

    this.logger.log(`✅ Utente aggiornato: ${updatedUser.email}`);

    return updatedUser;
  }

  async deactivate(id: string): Promise<void> {
    await this.userRepository.update(id, { isActive: false });
    this.logger.log(`⚠️ Utente disattivato: ${id}`);
  }

  async activate(id: string): Promise<void> {
    await this.userRepository.update(id, { isActive: true });
    this.logger.log(`✅ Utente riattivato: ${id}`);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Utente non trovato');
    }

    const userEmail = user.email;

    await this.userRepository.remove(user);
    this.logger.log(`🗑️ Utente eliminato: ${id}`);

    // Invia email di conferma eliminazione account
    if (userEmail) {
      try {
        await this.emailService.sendAccountDeleted({ email: userEmail });
      } catch (error) {
        this.logger.error(`Errore invio email account-deleted: ${error}`);
      }
    }
  }

  // ===========================
  // 🔐 PASSWORD MANAGEMENT
  // ===========================

  async updatePassword(_id: string, _hashedPassword: string): Promise<void> {
    // Password management is handled by Supabase Auth
    throw new Error('Password management is handled by Supabase Auth. Use Supabase client to change password.');
  }

  async changePassword(_id: string, _currentPassword: string, _newPassword: string): Promise<void> {
    // Password management is handled by Supabase Auth
    throw new UnauthorizedException('Password management is handled by Supabase Auth. Use the Supabase client to change your password.');
  }

  // ===========================
  // 🔄 CART MERGE
  // ===========================

  /**
   * ✅ Merge guest cart → customer cart
   * Chiamato da AuthService dopo login/registrazione
   * 
   * @param guestUserId - ID del guest user da cui migrare il cart
   * @param customerId - ID del customer a cui trasferire il cart
   */
  async mergeGuestCart(guestUserId: string, customerId: string): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      this.logger.log(`🔄 Merging guest cart: ${guestUserId} → customer ${customerId}`);

      // 1. Trova guest user
      const guestUser = await manager.findOne(User, {
        where: {
          id: guestUserId,
          role: UserRole.GUEST,
        },
      });

      if (!guestUser) {
        this.logger.warn(`⚠️ Guest user ${guestUserId} non trovato, skip merge`);
        return;
      }

      // 2. Trova customer user
      const customerUser = await manager.findOne(User, {
        where: { id: customerId },
      });

      if (!customerUser) {
        throw new NotFoundException(`Customer ${customerId} non trovato`);
      }

      // 3. Trasferisci cart items
      await manager
        .createQueryBuilder()
        .update(Cart)
        .set({ userId: customerUser.id })
        .where('userId = :guestUserId', { guestUserId: guestUser.id })
        .execute();

      this.logger.log(
        `✅ Cart items trasferiti da guest ${guestUser.id} a customer ${customerUser.id}`
      );

      // 4. Gestione guest user
      // 👉 Conta gli ordini REALI collegati al guest
      const ordersCount = await manager.getRepository(Order).count({ where: { userId: guestUser.id } });

      if (ordersCount > 0) {
        // Ha ordini → NON si può cancellare, al massimo lo marchi come merged
        this.logger.log(
          `ℹ️ Guest user ${guestUser.id} ha ${ordersCount} ordini, non lo elimino (markAsMerged)`
        );

        // opzionale: se hai questa logica di stato interno:
        if (guestUser.markAsMerged) {
          guestUser.markAsMerged(customerUser.id);
          await manager.save(User, guestUser);
        }
      } else if (guestUser.canBeDeleted && guestUser.canBeDeleted()) {
        // Nessun ordine → ora puoi davvero cancellare
        this.logger.log(`🗑️ Guest user ${guestUser.id} senza ordini, elimino`);
        await manager.delete(User, { id: guestUser.id });
      } else {
        this.logger.warn(
          `⚠️ Guest user ${guestUser.id} in stato anomalo: ` +
          `totalOrders=${guestUser.totalOrders}, merged=${guestUser.isMerged?.()}`
        );
      }

      this.logger.log(`✅ Cart merge completato`);
    });
  }

  // ===========================
  // 💳 STRIPE SYNC
  // ===========================

  async ensureStripeCustomer(
    userId: string,
    manager?: EntityManager,
  ): Promise<string> {
    // Usa SEMPRE il manager se fornito, altrimenti il dataSource globale
    const em = manager || this.dataSource.manager;
    const userRepo = em.getRepository(User);

    const user = await userRepo.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`Utente ${userId} non trovato`);
    }

    if (user.stripeCustomerId) {
      this.logger.log(
        `✅ Stripe Customer già esistente: ${user.stripeCustomerId} per ${user.email}`,
      );
      return user.stripeCustomerId;
    }

    try {
      const customer = await this.stripeService.createCustomer({
        email: user.email ?? user.lastCheckoutEmail ?? '',
        lastCheckoutEmail: user.lastCheckoutEmail ?? user.email ?? '',
        name:
          `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
          user.email || 'undefined',
        phone: user.phone || undefined,
        metadata: {
          dbUserId: user.id,
          environment: process.env.NODE_ENV || 'development',
          createdAt: new Date().toISOString(),
        },
      });

      // ⚠️ QUI PRIMA USAVI this.userRepository.update(...)
      await userRepo.update(user.id, {
        stripeCustomerId: customer.id,
      });

      this.logger.log(
        `✅ Stripe Customer creato: ${customer.id} per ${user.email}`,
      );

      return customer.id;
    } catch (error) {
      this.logger.error(
        `❌ Errore creazione Stripe Customer per ${user.email}:`,
        error,
      );
      throw error;
    }
  }

  async syncUserToStripe(userId: string): Promise<void> {
    const user = await this.findById(userId);

    if (!user) {
      throw new NotFoundException(`Utente ${userId} non trovato`);
    }

    if (!user.stripeCustomerId) {
      this.logger.warn(`⚠️ User ${user.email} non ha stripeCustomerId, skip sync`);
      return;
    }

    try {
      const stripe = this.stripeService.getStripeInstance();

      await stripe.customers.update(user.stripeCustomerId, {
        email: user.email || undefined,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || undefined,
        phone: user.phone || undefined,
        metadata: {
          dbUserId: user.id,
          lastSyncedAt: new Date().toISOString(),
        },
      });

      this.logger.log(`🔄 User → Stripe sync completato: ${user.email} → ${user.stripeCustomerId}`);
    } catch (error) {
      this.logger.error(`❌ Errore sync User → Stripe per ${user.email}:`, error);
    }
  }

  async syncStripeToUser(
    stripeCustomerId: string,
    customerData: {
      email?: string;
      name?: string;
      phone?: string;
    },
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { stripeCustomerId },
    });

    if (!user) {
      this.logger.warn(`⚠️ Stripe Customer ${stripeCustomerId} non collegato a nessun user DB`);
      return;
    }

    const updates: Partial<User> = {};

    if (customerData.email && customerData.email !== user.email) {
      const existingUser = await this.findByEmail(customerData.email);
      if (!existingUser || existingUser.id === user.id) {
        updates.email = customerData.email;
      }
    }

    if (customerData.name) {
      const [firstName, ...lastNameParts] = customerData.name.split(' ');
      if (firstName && firstName !== user.firstName) {
        updates.firstName = firstName;
      }
      const lastName = lastNameParts.join(' ');
      if (lastName && lastName !== user.lastName) {
        updates.lastName = lastName;
      }
    }

    if (customerData.phone && customerData.phone !== user.phone) {
      updates.phone = customerData.phone;
    }

    if (Object.keys(updates).length > 0) {
      await this.userRepository.update(user.id, updates);
      this.logger.log(`🔄 Stripe → User sync completato: ${stripeCustomerId} → ${user.email}`);
    }
  }

  // ===========================
  // 📊 STATS (ADMIN)
  // ===========================

  async getUserStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    adminUsers: number;
    customerUsers: number;
  }> {
    const [totalUsers, activeUsers, inactiveUsers, adminUsers, customerUsers] = await Promise.all([
      this.userRepository.count(),
      this.userRepository.count({ where: { isActive: true } }),
      this.userRepository.count({ where: { isActive: false } }),
      this.userRepository.count({ where: { role: UserRole.ADMIN } }),
      this.userRepository.count({ where: { role: UserRole.CUSTOMER } }),
    ]);

    return {
      totalUsers,
      activeUsers,
      inactiveUsers,
      adminUsers,
      customerUsers,
    };
  }

  // ===========================
  // 🧹 CLEANUP GUEST USERS
  // ===========================

  async cleanupExpiredGuests(): Promise<number> {
    const result = await this.userRepository
      .createQueryBuilder()
      .delete()
      .where('role = :role', { role: UserRole.GUEST })
      .andWhere('expiresAt < :now', { now: new Date() })
      .execute();

    const count = result.affected || 0;
    this.logger.log(`🧹 Rimossi ${count} guest users scaduti`);

    return count;
  }

  // ===========================
  // 🔒 GDPR COMPLIANCE
  // ===========================

  /**
   * GDPR: Export all user data
   * Returns all personal data associated with the user
   */
  async exportUserData(userId: string): Promise<{
    exportDate: string;
    user: Partial<User>;
    orders: Order[];
    reviews: Review[];
    addresses: Address[];
    consents: Consent | null;
    wishlist: Wishlist[];
    carts: Cart[];
  }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['addresses', 'consents', 'reviews', 'carts'],
    });

    if (!user) {
      throw new NotFoundException('Utente non trovato');
    }

    // Fetch orders with items
    const orders = await this.dataSource.getRepository(Order).find({
      where: { userId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });

    // Fetch wishlist
    const wishlist = await this.dataSource.getRepository(Wishlist).find({
      where: { userId },
      relations: ['product'],
    });

    // Sanitize user data (remove internal fields)
    const {
      mergedToUserId,
      mergedAt,
      guestUserId,
      ...sanitizedUser
    } = user as any;

    this.logger.log(`📦 GDPR Export completed for user: ${user.email}`);

    return {
      exportDate: new Date().toISOString(),
      user: sanitizedUser,
      orders,
      reviews: user.reviews || [],
      addresses: user.addresses || [],
      consents: user.consents || null,
      wishlist,
      carts: user.carts || [],
    };
  }

  /**
   * GDPR: Soft delete user account
   * Anonymizes PII and marks as deleted without removing data
   * Required for data retention policies while respecting right to be forgotten
   */
  async softDeleteUser(userId: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('Utente non trovato');
    }

    const originalEmail = user.email;

    // Anonymize PII before soft delete
    await this.userRepository.update(userId, {
      email: `deleted_${userId}@anonymized.local`,
      firstName: 'DELETED',
      lastName: 'USER',
      phone: undefined,
      lastCheckoutEmail: undefined,
      isActive: false,
    });

    // Soft delete (sets deletedAt timestamp)
    await this.userRepository.softDelete(userId);

    this.logger.log(`🔒 GDPR Soft delete completed for user: ${originalEmail} (ID: ${userId})`);

    // Send confirmation email to original address
    if (originalEmail) {
      try {
        await this.emailService.sendAccountDeleted({ email: originalEmail });
      } catch (error) {
        this.logger.error(`Errore invio email account-deleted: ${error}`);
      }
    }
  }

  /**
   * GDPR: Request account deletion (self-service)
   * User can request their own account deletion
   * Returns a grace period before actual deletion
   */
  async requestAccountDeletion(userId: string): Promise<{
    message: string;
    gracePeriodDays: number;
    scheduledDeletionDate: Date;
  }> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('Utente non trovato');
    }

    // Check for pending orders
    const pendingOrders = await this.dataSource.getRepository(Order).count({
      where: {
        userId,
        status: OrderStatus.PENDING,
      },
    });

    if (pendingOrders > 0) {
      throw new BadRequestException(
        `Non puoi eliminare l'account con ${pendingOrders} ordini in sospeso. Attendi il completamento.`
      );
    }

    const gracePeriodDays = 30;
    const scheduledDeletionDate = new Date();
    scheduledDeletionDate.setDate(scheduledDeletionDate.getDate() + gracePeriodDays);

    // Mark user for deletion
    await this.userRepository.update(userId, {
      isActive: false,
    });

    this.logger.log(`⏳ Account deletion requested for user: ${user.email}, scheduled for ${scheduledDeletionDate}`);

    return {
      message: `Account schedulato per eliminazione. Hai ${gracePeriodDays} giorni per annullare.`,
      gracePeriodDays,
      scheduledDeletionDate,
    };
  }
}