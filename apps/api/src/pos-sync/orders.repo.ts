import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SyncResultStatus } from '@offline-pos/sync-contract';

@Injectable()
export class OrdersRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Section 4.7: server-side idempotent write path.
   * Following AI-Driven-Implementation-technical-guide.md Section 3.4 Uniqueness Invariant.
   */
  async upsertByExternalId(
    externalId: string,
    payload: any,
  ): Promise<{ status: SyncResultStatus }> {
    // Check for existing record to determine status correctly (created vs updated vs duplicate)
    const existing = await this.prisma.order.findUnique({
      where: { externalId },
    });

    if (!existing) {
      await this.prisma.order.create({
        data: {
          externalId,
          payload: payload as any,
          syncStatus: 'SYNCED',
        },
      });
      return { status: 'created' };
    }

    // Section 4.6: at-least-once delivery tolerance / duplicate check
    // If payload is identical, it's a duplicate (no-op)
    if (JSON.stringify(existing.payload) === JSON.stringify(payload)) {
      return { status: 'duplicate' };
    }

    // If payload changed, it's an update
    await this.prisma.order.update({
      where: { externalId },
      data: {
        payload: payload as any,
        syncStatus: 'SYNCED',
      },
    });
    return { status: 'updated' };
  }
}