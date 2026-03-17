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
    payload: unknown,
  ): Promise<{ status: SyncResultStatus }> {
    // Check for existing record to determine status correctly (created vs updated vs duplicate)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const orderDelegate = (this.prisma as any).order;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const existing = (await orderDelegate.findUnique({
      where: { externalId },
    })) as { payload: unknown } | null;

    if (!existing) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await orderDelegate.create({
        data: {
          externalId,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await orderDelegate.update({
      where: { externalId },
      data: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        payload: payload as any,
        syncStatus: 'SYNCED',
      },
    });
    return { status: 'updated' };
  }
}
