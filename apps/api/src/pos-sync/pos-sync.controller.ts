import { Body, Controller, Post, UsePipes } from '@nestjs/common';
import { PosSyncService } from './pos-sync.service';
import { SyncBatchRequestSchema } from '@offline-pos/sync-contract';
import type {
  SyncBatchRequest,
  SyncBatchResponse,
} from '@offline-pos/sync-contract';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('v1/pos')
export class PosSyncController {
  constructor(private readonly svc: PosSyncService) {}

  @Post('sync')
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  @UsePipes(new ZodValidationPipe(SyncBatchRequestSchema as any))
  async sync(@Body() dto: SyncBatchRequest): Promise<SyncBatchResponse> {
    return this.svc.syncBatch(dto);
  }
}
