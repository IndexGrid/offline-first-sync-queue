import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { OrdersRepo } from './orders.repo';
import { PosSyncResult, SyncOrderInput } from './pos-sync.dto';

@Injectable()
export class PosSyncService {
  constructor(private readonly orders: OrdersRepo) {}

  async syncBatch(items: SyncOrderInput[]): Promise<PosSyncResult[]> {
    const results: PosSyncResult[] = [];

    for (const item of items) {
      const externalId = String(item.externalId ?? '');

      // Validação por item (preserva "resultado por item", sem derrubar o batch inteiro)
      if (!externalId) {
        results.push({ externalId, status: 'invalid', reason: 'missing_externalId' });
        continue;
      }
      if (!isUUID(externalId)) {
        results.push({ externalId, status: 'invalid', reason: 'invalid_externalId' });
        continue;
      }
      if (item.data === null || item.data === undefined || typeof item.data !== 'object') {
        results.push({ externalId, status: 'invalid', reason: 'invalid_data' });
        continue;
      }

      try {
        const r = await this.orders.upsertByExternalId(externalId, item.data);
        results.push({ externalId, status: r.status });
      } catch {
        // Produção: diferenciar erro transitório (retry) vs erro permanente (invalid)
        results.push({ externalId, status: 'error', reason: 'db_error' });
      }
    }

    return results;
  }
}