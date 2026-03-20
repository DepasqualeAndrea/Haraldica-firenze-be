import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";

export class ReviewVoteDto {
  @ApiProperty({ 
    description: 'Se il voto è positivo (utile) o negativo',
    example: true 
  })
  @IsBoolean()
  isHelpful: boolean;
}