// src/modules/admin-api/newsletter/newsletter.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, In } from 'typeorm';

// Entities
import { Newsletter, NewsletterStatus } from 'src/database/entities/newsletter.entity';
import { User, UserRole } from 'src/database/entities/user.entity';
import { Consent } from 'src/database/entities/consent.entity';

// Services
import { EmailService } from 'src/modules/public-api/notifications/email.service';

// DTOs
import {
  CreateNewsletterDto,
  UpdateNewsletterDto,
  NewsletterFilterDto,
} from './dto/create-newsletter.dto';

@Injectable()
export class NewsletterService {
  private readonly logger = new Logger(NewsletterService.name);

  constructor(
    @InjectRepository(Newsletter)
    private newsletterRepository: Repository<Newsletter>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Consent)
    private consentRepository: Repository<Consent>,
    private emailService: EmailService,
  ) {}

  // ===========================
  // CRUD OPERATIONS
  // ===========================

  async create(dto: CreateNewsletterDto, adminId: string): Promise<Newsletter> {
    const newsletter = this.newsletterRepository.create({
      ...dto,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      createdBy: adminId,
      status: NewsletterStatus.DRAFT,
    });

    const saved = await this.newsletterRepository.save(newsletter);
    this.logger.log(`📧 Newsletter creata: ${saved.id} (${saved.subject})`);

    return saved;
  }

  async findAll(filter?: NewsletterFilterDto): Promise<{
    newsletters: Newsletter[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = filter?.page || 1;
    const limit = filter?.limit || 20;

    const where: FindOptionsWhere<Newsletter> = {};

    if (filter?.status) {
      where.status = filter.status as NewsletterStatus;
    }

    if (filter?.search) {
      where.subject = Like(`%${filter.search}%`);
    }

    const [newsletters, total] = await this.newsletterRepository.findAndCount({
      where,
      order: {
        [filter?.sortBy || 'createdAt']: filter?.sortOrder || 'DESC',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { newsletters, total, page, limit };
  }

  async findById(id: string): Promise<Newsletter> {
    const newsletter = await this.newsletterRepository.findOne({
      where: { id },
    });

    if (!newsletter) {
      throw new NotFoundException('Newsletter non trovata');
    }

    return newsletter;
  }

  async update(id: string, dto: UpdateNewsletterDto): Promise<Newsletter> {
    const newsletter = await this.findById(id);

    if (!newsletter.canEdit) {
      throw new BadRequestException('Non puoi modificare una newsletter già inviata');
    }

    Object.assign(newsletter, {
      ...dto,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : newsletter.scheduledAt,
    });

    const saved = await this.newsletterRepository.save(newsletter);
    this.logger.log(`📧 Newsletter aggiornata: ${saved.id}`);

    return saved;
  }

  async delete(id: string): Promise<void> {
    const newsletter = await this.findById(id);

    if (newsletter.status === NewsletterStatus.SENDING) {
      throw new BadRequestException('Non puoi eliminare una newsletter in invio');
    }

    await this.newsletterRepository.remove(newsletter);
    this.logger.log(`🗑️ Newsletter eliminata: ${id}`);
  }

  // ===========================
  // SCHEDULING & SENDING
  // ===========================

  async schedule(id: string, scheduledAt: Date): Promise<Newsletter> {
    const newsletter = await this.findById(id);

    if (!newsletter.canSend) {
      throw new BadRequestException('Newsletter non può essere programmata');
    }

    if (scheduledAt <= new Date()) {
      throw new BadRequestException('La data di invio deve essere nel futuro');
    }

    newsletter.scheduledAt = scheduledAt;
    newsletter.status = NewsletterStatus.SCHEDULED;

    const saved = await this.newsletterRepository.save(newsletter);
    this.logger.log(`⏰ Newsletter programmata: ${saved.id} per ${scheduledAt}`);

    return saved;
  }

  async cancel(id: string): Promise<Newsletter> {
    const newsletter = await this.findById(id);

    if (newsletter.status !== NewsletterStatus.SCHEDULED) {
      throw new BadRequestException('Solo newsletter programmate possono essere annullate');
    }

    newsletter.status = NewsletterStatus.CANCELLED;
    newsletter.scheduledAt = undefined;

    const saved = await this.newsletterRepository.save(newsletter);
    this.logger.log(`❌ Newsletter annullata: ${saved.id}`);

    return saved;
  }

  async sendNow(id: string): Promise<Newsletter> {
    const newsletter = await this.findById(id);

    if (!newsletter.canSend) {
      throw new BadRequestException('Newsletter non può essere inviata');
    }

    // Get recipients
    const recipients = await this.getRecipients(newsletter);

    if (recipients.length === 0) {
      throw new BadRequestException('Nessun destinatario trovato');
    }

    newsletter.status = NewsletterStatus.SENDING;
    newsletter.recipientCount = recipients.length;
    await this.newsletterRepository.save(newsletter);

    this.logger.log(`📤 Inizio invio newsletter ${id} a ${recipients.length} destinatari`);

    // Send in batches
    await this.sendToRecipients(newsletter, recipients);

    newsletter.status = NewsletterStatus.SENT;
    newsletter.sentAt = new Date();
    const saved = await this.newsletterRepository.save(newsletter);

    this.logger.log(`✅ Newsletter inviata: ${saved.id}`);

    return saved;
  }

  // ===========================
  // RECIPIENT MANAGEMENT
  // ===========================

  async getRecipients(newsletter: Newsletter): Promise<string[]> {
    const target = newsletter.targetAudience;

    // Base query: utenti attivi con consenso marketing
    let query = this.userRepository
      .createQueryBuilder('user')
      .innerJoin('user.consents', 'consent')
      .where('user.isActive = :active', { active: true })
      .andWhere('user.role IN (:...roles)', { roles: [UserRole.CUSTOMER] })
      .andWhere('consent.marketingConsent = :marketing', { marketing: true })
      .andWhere('user.email IS NOT NULL');

    // Apply filters
    if (target) {
      if (target.vipOnly) {
        query = query.andWhere('(user.totalOrders >= :minOrders OR user.totalSpent >= :minSpent)', {
          minOrders: 3,
          minSpent: 100,
        });
      }

      if (target.minOrders) {
        query = query.andWhere('user.totalOrders >= :minOrders', {
          minOrders: target.minOrders,
        });
      }

      if (target.minSpent) {
        query = query.andWhere('user.totalSpent >= :minSpent', {
          minSpent: target.minSpent,
        });
      }

      if (target.registeredAfter) {
        query = query.andWhere('user.createdAt >= :regAfter', {
          regAfter: target.registeredAfter,
        });
      }

      if (target.registeredBefore) {
        query = query.andWhere('user.createdAt <= :regBefore', {
          regBefore: target.registeredBefore,
        });
      }
    }

    const users = await query.select(['user.email']).getMany();

    return users.map(u => u.email).filter(Boolean) as string[];
  }

  async getRecipientsCount(id: string): Promise<number> {
    const newsletter = await this.findById(id);
    const recipients = await this.getRecipients(newsletter);
    return recipients.length;
  }

  // ===========================
  // EMAIL SENDING
  // ===========================

  private async sendToRecipients(
    newsletter: Newsletter,
    recipients: string[],
  ): Promise<void> {
    const batchSize = 50;
    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map(email =>
          this.emailService.sendEmail(
            {
              to: email,
              subject: newsletter.subject,
              template: 'newsletter',
              context: {
                content: newsletter.content,
                previewText: newsletter.previewText,
                ctaText: newsletter.ctaText,
                ctaUrl: newsletter.ctaUrl,
                headerImage: newsletter.headerImage,
                discountCode: newsletter.discountCode?.code,
                unsubscribeUrl: `${process.env.FRONTEND_URL}/unsubscribe?email=${encodeURIComponent(email)}`,
              },
            },
            'marketing',
          ),
        ),
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          sentCount++;
        } else {
          failedCount++;
        }
      }

      // Update progress
      await this.newsletterRepository.update(newsletter.id, {
        sentCount,
        failedCount,
      });

      // Rate limiting: wait between batches
      if (i + batchSize < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    this.logger.log(
      `📧 Newsletter ${newsletter.id}: ${sentCount} inviate, ${failedCount} fallite`,
    );
  }

  // ===========================
  // STATS
  // ===========================

  async getStats(): Promise<{
    total: number;
    drafts: number;
    scheduled: number;
    sent: number;
    totalRecipients: number;
    totalOpens: number;
    totalClicks: number;
  }> {
    const [total, drafts, scheduled, sent] = await Promise.all([
      this.newsletterRepository.count(),
      this.newsletterRepository.count({ where: { status: NewsletterStatus.DRAFT } }),
      this.newsletterRepository.count({ where: { status: NewsletterStatus.SCHEDULED } }),
      this.newsletterRepository.count({ where: { status: NewsletterStatus.SENT } }),
    ]);

    const stats = await this.newsletterRepository
      .createQueryBuilder('newsletter')
      .select('SUM(newsletter.recipientCount)', 'totalRecipients')
      .addSelect('SUM(newsletter.openCount)', 'totalOpens')
      .addSelect('SUM(newsletter.clickCount)', 'totalClicks')
      .where('newsletter.status = :status', { status: NewsletterStatus.SENT })
      .getRawOne();

    return {
      total,
      drafts,
      scheduled,
      sent,
      totalRecipients: parseInt(stats?.totalRecipients || '0'),
      totalOpens: parseInt(stats?.totalOpens || '0'),
      totalClicks: parseInt(stats?.totalClicks || '0'),
    };
  }

  // ===========================
  // CRON: Process scheduled newsletters
  // ===========================

  async processScheduledNewsletters(): Promise<number> {
    const now = new Date();

    const scheduledNewsletters = await this.newsletterRepository.find({
      where: {
        status: NewsletterStatus.SCHEDULED,
      },
    });

    let processedCount = 0;

    for (const newsletter of scheduledNewsletters) {
      if (newsletter.scheduledAt && newsletter.scheduledAt <= now) {
        try {
          await this.sendNow(newsletter.id);
          processedCount++;
        } catch (error) {
          this.logger.error(
            `❌ Errore invio newsletter programmata ${newsletter.id}: ${error.message}`,
          );
        }
      }
    }

    if (processedCount > 0) {
      this.logger.log(`📬 Processate ${processedCount} newsletter programmate`);
    }

    return processedCount;
  }
}
