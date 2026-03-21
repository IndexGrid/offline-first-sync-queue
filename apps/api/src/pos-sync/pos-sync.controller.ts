import { Body, Controller, Headers, Post, UsePipes } from '@nestjs/common';
import { PosSyncService } from './pos-sync.service';
import { SyncBatchRequestTransportSchema } from '@offline-pos/sync-contract';
import type {
  SyncBatchRequestTransport,
  SyncBatchResponse,
} from '@offline-pos/sync-contract';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('v1/pos')
export class PosSyncController {
  constructor(private readonly svc: PosSyncService) {}

  @Post('sync')
  @UsePipes(new ZodValidationPipe(SyncBatchRequestTransportSchema))
  async sync(
    @Body() dto: SyncBatchRequestTransport,
    @Headers('x-api-key') apiKey?: string,
  ): Promise<SyncBatchResponse> {
    return this.svc.syncBatch(dto, apiKey);
  }
}
