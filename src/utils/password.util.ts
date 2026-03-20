import * as bcrypt from 'bcrypt';

export class PasswordUtil {
  private static readonly SALT_ROUNDS = 12;

  static async hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  static async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  static validate(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password deve essere almeno 8 caratteri');
    }

    if (!/(?=.*[a-z])/.test(password)) {
      errors.push('Password deve contenere almeno una lettera minuscola');
    }

    if (!/(?=.*[A-Z])/.test(password)) {
      errors.push('Password deve contenere almeno una lettera maiuscola');
    }

    if (!/(?=.*\d)/.test(password)) {
      errors.push('Password deve contenere almeno un numero');
    }

    if (!/(?=.*[@$!%*?&])/.test(password)) {
      errors.push('Password deve contenere almeno un carattere speciale');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}