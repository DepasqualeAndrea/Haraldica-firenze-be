// src/modules/public-api/utils/utils.controller.ts

import {
  Controller,
  Get,
  Param,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { UtilsService, CapLookupResult } from './utils.service';

@Controller('utils')
export class UtilsController {
  constructor(private readonly utilsService: UtilsService) {}

  /**
   * GET /api/v1/utils/cap/:cap
   * Lookup CAP → città e provincia
   * Endpoint pubblico (no auth required)
   *
   * @param cap - Codice di avviamento postale (5 cifre)
   * @returns { city: string, province: string, region?: string }
   */
  @Get('cap/:cap')
  lookupCap(@Param('cap') cap: string): CapLookupResult {
    // Validazione formato CAP
    if (!cap || !/^\d{5}$/.test(cap.trim())) {
      throw new BadRequestException(
        'CAP non valido. Il CAP deve essere composto da 5 cifre.',
      );
    }

    const result = this.utilsService.lookupCap(cap);

    if (!result) {
      throw new NotFoundException(`CAP ${cap} non trovato nel database.`);
    }

    return result;
  }

  /**
   * GET /api/v1/utils/cap/:cap/validate
   * Verifica se un CAP esiste
   * Endpoint pubblico (no auth required)
   *
   * @param cap - Codice di avviamento postale
   * @returns { valid: boolean, cap: string }
   */
  @Get('cap/:cap/validate')
  validateCap(@Param('cap') cap: string): { valid: boolean; cap: string } {
    const normalizedCap = cap.trim().padStart(5, '0');
    const isValid = this.utilsService.isValidCap(normalizedCap);

    return {
      valid: isValid,
      cap: normalizedCap,
    };
  }

  /**
   * GET /api/v1/utils/cap-stats
   * Ritorna statistiche sul database CAP
   * Endpoint pubblico (no auth required)
   */
  @Get('cap-stats')
  getCapStats(): { totalCaps: number; lastUpdated: string } {
    return this.utilsService.getCapStats();
  }
}
