import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class OrdersRepo {
  constructor(private readonly pool: Pool) {}

  async upsertByExternalId(
    externalId: string,
    payload: any,
  ): Promise<{ status: 'created' | 'updated' | 'duplicate' }> {
    /**
     * Estratégia:
     * - INSERT: created
     * - CONFLICT + payload diferente: updated
     * - CONFLICT + payload igual: duplicate (nenhuma escrita)
     *
     * Observação: `WHERE ... IS DISTINCT FROM ...` evita update "à toa" quando for reenvio idêntico.
     */
    const q = `
      INSERT INTO orders (external_id, payload)
      VALUES ($1::uuid, $2::jsonb)
      ON CONFLICT (external_id) DO UPDATE
        SET payload = EXCLUDED.payload,
            updated_at = now()
        WHERE orders.payload IS DISTINCT FROM EXCLUDED.payload
      RETURNING (xmax = 0) AS inserted;
    `;

    const res = await this.pool.query(q, [externalId, JSON.stringify(payload)]);

    // 0 rows => conflito sem update (payload igual) => duplicate
    if (!res.rows?.length) return { status: 'duplicate' };

    const inserted = Boolean(res.rows[0].inserted);
    return { status: inserted ? 'created' : 'updated' };
  }
}