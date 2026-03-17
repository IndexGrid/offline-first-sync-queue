import { Injectable, Logger } from '@nestjs/common';
import { OrdersRepo } from './orders.repo';
import {
  SyncBatchRequest,
  SyncBatchResponse,
} from '@offline-pos/sync-contract';

@Injectable()
export class PosSyncService {
  private readonly logger = new Logger(PosSyncService.name);

  constructor(private readonly orders: OrdersRepo) {}

  /**
   * Section 5: API Contract Hardening.
   * Returns per-item status, never opaque batch-only success.
   */
  async syncBatch(input: SyncBatchRequest): Promise<SyncBatchResponse> {
    const results: SyncBatchResponse['results'] = [];
    const startTime = Date.now();

    // Section 8.5: batch size telemetry
    this.logger.log({
      message: 'Processing sync batch',
      deviceId: input.deviceId,
      batchSize: input.items.length,
    });

    for (const item of input.items) {
      const externalId = item.externalId;

      try {
        const r = await this.orders.upsertByExternalId(
          externalId,
          item.payload,
        );
        results.push({ externalId, status: r.status });

        // Section 8.6: per-status response distribution
        this.logger.debug({
          message: 'Item processed',
          externalId,
          status: r.status,
        });
      } catch (error) {
        // Section 8.4: dead-letter / error count
        this.logger.error({
          message: 'Error syncing item',
          externalId,
          error:
            error instanceof Error ? error.message : 'internal_server_error',
          stack: error instanceof Error ? error.stack : undefined,
        });
        results.push({
          externalId,
          status: 'error',
          reason:
            error instanceof Error ? error.message : 'internal_server_error',
        });
      }
    }

    const duration = Date.now() - startTime;
    // Section 8.7: sync latency telemetry
    this.logger.log({
      message: 'Sync batch completed',
      deviceId: input.deviceId,
      durationMs: duration,
      resultsCount: results.length,
    });

    return { results };
  }
}
