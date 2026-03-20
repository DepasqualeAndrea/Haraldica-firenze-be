import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsString, IsUUID, ArrayMinSize, ArrayMaxSize, IsEnum, IsOptional, Length } from "class-validator";

export class BulkReviewActionDto {
  @ApiProperty({ 
    description: 'Lista di ID recensioni su cui applicare l\'azione',
    type: [String] 
  })
  @IsArray()
  @IsString({ each: true })
  @IsUUID(undefined, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  reviewIds: string[];

  @ApiProperty({ 
    description: 'Azione da eseguire',
    enum: ['approve', 'disapprove', 'feature', 'unfeature', 'delete'] 
  })
  @IsEnum(['approve', 'disapprove', 'feature', 'unfeature', 'delete'])
  action: 'approve' | 'disapprove' | 'feature' | 'unfeature' | 'delete';

  @ApiPropertyOptional({ 
    description: 'Motivo dell\'azione (per log admin)',
    maxLength: 500 
  })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  reason?: string;
}