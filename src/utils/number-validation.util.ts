import { Logger } from '@nestjs/common';

export class NumberValidationUtil {
  private static readonly logger = new Logger(NumberValidationUtil.name);

  /**
   * Valida e converte un valore in numero sicuro
   */
  static validateNumber(value: any, defaultValue: number = 0): number {
    if (value === null || value === undefined) {
      return defaultValue;
    }
    
    const numValue = typeof value === 'string' ? parseFloat(value) : Number(value);
    
    if (isNaN(numValue) || !isFinite(numValue)) {
      this.logger.warn(`Valore numerico non valido: ${value}, usando default: ${defaultValue}`);
      return defaultValue;
    }
    
    return numValue;
  }

  /**
   * Verifica se un importo è valido per transazioni monetarie
   */
  static isValidAmount(amount: any, maxAmount: number = 999999.99): boolean {
    const numAmount = this.validateNumber(amount);
    return numAmount >= 0 && numAmount <= maxAmount && isFinite(numAmount);
  }

  /**
   * Formatta un importo come stringa con 2 decimali
   */
  static formatAmount(amount: any, currency: string = '€'): string {
    const validAmount = this.validateNumber(amount, 0);
    return `${currency}${validAmount.toFixed(2)}`;
  }

  /**
   * Arrotonda un numero a 2 decimali (per importi monetari)
   */
  static roundToTwo(value: any): number {
    const numValue = this.validateNumber(value, 0);
    return Math.round((numValue + Number.EPSILON) * 100) / 100;
  }

  /**
   * Converte da centesimi a euro (per Stripe)
   */
  static centsToEuros(cents: any): number {
    const validCents = this.validateNumber(cents, 0);
    return this.roundToTwo(validCents / 100);
  }

  /**
   * Converte da euro a centesimi (per Stripe)
   */
  static eurosToCents(euros: any): number {
    const validEuros = this.validateNumber(euros, 0);
    return Math.round(validEuros * 100);
  }

  /**
   * Calcola percentuale con validazione
   */
  static calculatePercentage(amount: any, percentage: any): number {
    const validAmount = this.validateNumber(amount, 0);
    const validPercentage = this.validateNumber(percentage, 0);
    
    if (validPercentage < 0 || validPercentage > 100) {
      this.logger.warn(`Percentuale non valida: ${percentage}%`);
      return 0;
    }
    
    return this.roundToTwo(validAmount * (validPercentage / 100));
  }

  /**
   * Somma sicura di array di numeri
   */
  static safeSum(numbers: any[]): number {
    if (!Array.isArray(numbers) || numbers.length === 0) {
      return 0;
    }

    return numbers.reduce((sum, num) => {
      return sum + this.validateNumber(num, 0);
    }, 0);
  }

  /**
   * Verifica se un numero è positivo
   */
  static isPositive(value: any): boolean {
    const numValue = this.validateNumber(value, 0);
    return numValue > 0;
  }

  /**
   * Verifica se un numero è zero o positivo
   */
  static isZeroOrPositive(value: any): boolean {
    const numValue = this.validateNumber(value, 0);
    return numValue >= 0;
  }
}

// ✅ Decoratore per validazione automatica di parametri numerici
export function ValidateNumber(defaultValue: number = 0) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: any[]) {
      // Valida tutti i parametri numerici
      const validatedArgs = args.map(arg => {
        if (typeof arg === 'number' || (typeof arg === 'string' && !isNaN(Number(arg)))) {
          return NumberValidationUtil.validateNumber(arg, defaultValue);
        }
        return arg;
      });

      return originalMethod.apply(this, validatedArgs);
    };

    return descriptor;
  };
}