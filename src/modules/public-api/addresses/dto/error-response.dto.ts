import { ApiProperty } from "@nestjs/swagger";

export class AddressErrorResponseDto {
  @ApiProperty({ description: 'Codice errore' })
  statusCode: number;

  @ApiProperty({ description: 'Messaggio errore' })
  message: string;

  @ApiProperty({ description: 'Dettagli errore', type: [String] })
  details?: string[];

  @ApiProperty({ description: 'Timestamp errore' })
  timestamp: string;

  @ApiProperty({ description: 'Path richiesta' })
  path: string;
}