import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

export class StoreResponseDto {
  @ApiProperty({ 
    description: 'Risposta del negozio alla recensione',
    example: 'Grazie per il feedback! Siamo felici che il prodotto ti sia piaciuto. Per qualsiasi domanda, il nostro team è sempre disponibile.',
    minLength: 10,
    maxLength: 1000 
  })
  @IsString()
  @Length(10, 1000)
  storeResponse: string;
}