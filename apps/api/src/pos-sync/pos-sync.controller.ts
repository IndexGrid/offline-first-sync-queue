import { Body, Controller, Post } from '@nestjs/common';
import { PosSyncService } from './pos-sync.service';
import { SyncBatchRequest, SyncBatchResponse } from '@offline-pos/sync-contract';

@Controller('v1/pos')
export class PosSyncController {
  constructor(private readonly svc: PosSyncService) {}

  @Post('sync')
  async sync(@Body() dto: SyncBatchRequest): Promise<SyncBatchResponse> {
    return this.svc.syncBatch(dto);
  }
}