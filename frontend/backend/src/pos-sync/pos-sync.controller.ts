import { Body, Controller, Post } from '@nestjs/common';
import { PosSyncRequestDto, PosSyncResponseDto } from './pos-sync.dto';
import { PosSyncService } from './pos-sync.service';

@Controller('/admin/pos')
export class PosSyncController {
  constructor(private readonly svc: PosSyncService) {}

  @Post('/sync')
  async sync(@Body() dto: PosSyncRequestDto): Promise<PosSyncResponseDto> {
    const results = await this.svc.syncBatch(dto.orders);
    return { results };
  }
}