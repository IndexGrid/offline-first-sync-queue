import { Injectable, Logger } from '@nestjs/common';
import { OrdersRepo } from './orders.repo';
import {
  SyncBatchItemSchema,
  SyncBatchRequestTransport,
  SyncBatchResponse,
} from '@offline-pos/sync-contract';
import type { Prisma } from '@prisma/client';

function extractExternalIdCandidate(value: unknown): string {
  if (!value || typeof value !== 'object') return 'unknown';
  const v = value as Record<string, unknown>;
  if (typeof v.externalId === 'string') return v.externalId;
  return 'unknown';
}

function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return true;
  const e = error as Record<string, unknown>;
  const code = typeof e.code === 'string' ? e.code : '';
  if (code.startsWith('P100') || code === 'P2024') return true;
  const message = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  if (
    message.includes('invalid') ||
    message.includes('validation') ||
    message.includes('unauthorized') ||
    message.includes('forbidden')
  ) {
    return false;
  }
  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('p1001')
  ) {
    return true;
  }
  return true;
}

@Injectable()
export class PosSyncService {
  private readonly logger = new Logger(PosSyncService.name);

  constructor(private readonly orders: OrdersRepo) {}

  /**
   * Section 5: API Contract Hardening.
   * Returns per-item status, never opaque batch-only success.
   */
  async syncBatch(
    input: SyncBatchRequestTransport,
    apiKey?: string,
  ): Promise<SyncBatchResponse> {
    const results: SyncBatchResponse['results'] = [];
    const startTime = Date.now();

    // Section 8.5: batch size telemetry
    this.logger.log({
      message: 'Processing sync batch',
      deviceId: input.deviceId,
      batchSize: input.items.length,
    });

    const requiredApiKey = process.env.SYNC_API_KEY;
    if (requiredApiKey && apiKey !== requiredApiKey) {
      for (const rawItem of input.items) {
        results.push({
          externalId: extractExternalIdCandidate(rawItem),
          status: 'auth_required',
          reason: 'invalid_api_key',
        });
      }

      const duration = Date.now() - startTime;
      this.logger.log({
        message: 'Sync batch completed',
        deviceId: input.deviceId,
        durationMs: duration,
        resultsCount: results.length,
      });
      return { results };
    }

    for (const rawItem of input.items) {
      const externalId = extractExternalIdCandidate(rawItem);
      const parsedItem = SyncBatchItemSchema.safeParse(rawItem);
      if (!parsedItem.success) {
        results.push({
          externalId,
          status: 'invalid',
          reason: parsedItem.error.message,
        });
        continue;
      }

      try {
        const r = await this.orders.upsertByExternalId(
          parsedItem.data.externalId,
          parsedItem.data.payload as Prisma.InputJsonValue,
        );
        results.push({
          externalId: parsedItem.data.externalId,
          status: r.status,
        });

        this.logger.debug({
          message: 'Item processed',
          externalId: parsedItem.data.externalId,
          status: r.status,
        });
      } catch (error) {
        const retriable = isRetryableError(error);
        const reason =
          error instanceof Error ? error.message : 'internal_server_error';
        this.logger.error({
          message: 'Error syncing item',
          externalId: parsedItem.data.externalId,
          error: reason,
          stack: error instanceof Error ? error.stack : undefined,
        });
        results.push({
          externalId: parsedItem.data.externalId,
          status: retriable ? 'retriable_error' : 'fatal_error',
          reason,
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
