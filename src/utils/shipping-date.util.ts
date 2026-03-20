/**
 * 📦 SHIPPING DATE UTILITIES
 * 
 * Logica di calcolo data spedizione basata su cut-off time ore 19:00
 * 
 * REGOLA:
 * - Ordini PRIMA delle 19:00 → Spedizione giorno stesso
 * - Ordini DOPO le 19:00 → Spedizione giorno successivo
 */

import { Logger } from '@nestjs/common';

const logger = new Logger('ShippingDateUtil');

export interface ShippingDateRange {
  startDate: Date;
  endDate: Date;
  shippingDate: string; // YYYY-MM-DD
}

/**
 * Calcola la data di spedizione per un ordine in base all'orario di creazione
 * 
 * @param orderCreatedAt Data/ora creazione ordine
 * @returns Data di spedizione (YYYY-MM-DD)
 * 
 * @example
 * calculateShippingDate(new Date('2026-01-20 15:30')) // → '2026-01-20'
 * calculateShippingDate(new Date('2026-01-20 19:01')) // → '2026-01-21'
 */
export function calculateShippingDate(orderCreatedAt: Date): string {
  const orderDate = new Date(orderCreatedAt);
  const orderHour = orderDate.getHours();
  
  const shippingDate = new Date(orderDate);
  shippingDate.setHours(0, 0, 0, 0);
  
  // Se ordine dopo le 19:00, spedizione giorno successivo
  if (orderHour >= 19) {
    shippingDate.setDate(shippingDate.getDate() + 1);
  }
  
  return formatDateYYYYMMDD(shippingDate);
}

/**
 * Calcola il range temporale per filtrare ordini di una specifica data di spedizione
 * 
 * @param shippingDate Data spedizione desiderata (YYYY-MM-DD)
 * @returns Range temporale per query database
 * 
 * @example
 * getShippingDateRange('2026-01-20')
 * // → { startDate: 2026-01-19 19:00:00, endDate: 2026-01-20 18:59:59 }
 */
export function getShippingDateRange(shippingDate: string): ShippingDateRange {
  const targetDate = new Date(shippingDate);
  
  // Range: da 19:00 giorno precedente a 18:59:59 giorno target
  const startDate = new Date(targetDate);
  startDate.setDate(startDate.getDate() - 1);
  startDate.setHours(19, 0, 0, 0);
  
  const endDate = new Date(targetDate);
  endDate.setHours(18, 59, 59, 999);
  
  logger.debug(
    `📅 Range spedizione ${shippingDate}: ${startDate.toISOString()} → ${endDate.toISOString()}`
  );
  
  return {
    startDate,
    endDate,
    shippingDate
  };
}

/**
 * Ottiene la data di spedizione di oggi
 * 
 * @returns Data spedizione corrente (YYYY-MM-DD)
 */
export function getTodayShippingDate(): string {
  return calculateShippingDate(new Date());
}

/**
 * Verifica se un ordine può ancora essere modificato in base alla data spedizione
 * 
 * @param orderCreatedAt Data creazione ordine
 * @param cutoffHours Ore prima della spedizione entro cui è modificabile (default: 1)
 * @returns true se modificabile, false altrimenti
 */
export function canModifyBeforeShipping(
  orderCreatedAt: Date,
  cutoffHours: number = 1
): boolean {
  const now = new Date();
  const hoursSinceCreation = (now.getTime() - orderCreatedAt.getTime()) / (1000 * 60 * 60);
  
  return hoursSinceCreation < cutoffHours;
}

/**
 * Calcola minuti rimanenti prima del blocco auto-conferma (5min per test)
 * 
 * @param orderCreatedAt Data creazione ordine
 * @returns Minuti rimanenti (0 se scaduto)
 */
export function getMinutesUntilAutoConfirm(orderCreatedAt: Date): number {
  const now = new Date();
  const fiveMinutesLater = new Date(orderCreatedAt.getTime() + 5 * 60 * 1000);
  
  const minutesRemaining = Math.max(
    0,
    Math.floor((fiveMinutesLater.getTime() - now.getTime()) / (1000 * 60))
  );
  
  return minutesRemaining;
}

/**
 * Verifica se un ordine è oltre il limite di auto-conferma (1h)
 * 
 * @param orderCreatedAt Data creazione ordine
 * @returns true se oltre 1h, false altrimenti
 */
export function isOrderBeyondAutoConfirmTime(orderCreatedAt: Date): boolean {
  const now = new Date();
  const hoursSinceCreation = (now.getTime() - orderCreatedAt.getTime()) / (1000 * 60 * 60);
  
  return hoursSinceCreation >= 1;
}

// ===========================
// HELPER FUNCTIONS
// ===========================

function formatDateYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Parse data da string YYYY-MM-DD
 */
export function parseShippingDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}
