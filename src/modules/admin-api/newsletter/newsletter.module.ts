// src/modules/admin-api/newsletter/newsletter.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Newsletter } from 'src/database/entities/newsletter.entity';
import { User } from 'src/database/entities/user.entity';
import { Consent } from 'src/database/entities/consent.entity';

// Service & Controller
import { NewsletterService } from './newsletter.service';
import { NewsletterController } from './newsletter.controller';

// External Modules
import { NotificationsModule } from 'src/modules/public-api/notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Newsletter, User, Consent]),
    NotificationsModule,
  ],
  controllers: [NewsletterController],
  providers: [NewsletterService],
  exports: [NewsletterService],
})
export class NewsletterModule {}
