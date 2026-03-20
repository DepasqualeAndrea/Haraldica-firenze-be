import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RegisterDto } from '../dto/register.dto';
import { Consent } from 'src/database/entities/consent.entity';
import { User } from 'src/database/entities/user.entity';

@Injectable()
export class ConsentsService {
  constructor(
    @InjectRepository(Consent)
    private consentsRepository: Repository<Consent>,
  ) {}

  async createInitialConsents(
    user: User,
    consentData: RegisterDto,
    ipAddress: string,
    userAgent: string,
  ): Promise<Consent> {
    const newConsent = this.consentsRepository.create({
      user: user,
      userId: user.id,
      termsAccepted: consentData.agreeTerms,
      privacyAccepted: consentData.agreePrivacy,
      marketingConsent: consentData.agreeNewsletter || false,
      ipAddress: ipAddress,
      userAgent: userAgent,
    });

    return this.consentsRepository.save(newConsent);
  }
}