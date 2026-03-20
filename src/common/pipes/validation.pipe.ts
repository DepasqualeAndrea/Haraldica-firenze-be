import { Injectable, PipeTransform, BadRequestException } from "@nestjs/common";

@Injectable()
export class ParseOptionalUUIDPipe implements PipeTransform {
  transform(value: any): string | undefined {
    if (!value) return undefined;
    
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(value)) {
      throw new BadRequestException('Invalid UUID format');
    }
    
    return value;
  }
}

@Injectable()
export class ParseOptionalDatePipe implements PipeTransform {
  transform(value: any): Date | undefined {
    if (!value) return undefined;
    
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date format');
    }
    
    return date;
  }
}