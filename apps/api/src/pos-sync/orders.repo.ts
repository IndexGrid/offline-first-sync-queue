import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SyncResultStatus } from '@offline-pos/sync-contract';
import type { Prisma } from '@prisma/client';

function stableStringify(value: unknown): string {
  if (value === undefined) return '"__undefined__"';
  if (value === null) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  const props = keys.map(
    (k) =>
      `${JSON.stringify(k)}:${stableStringify(
        (value as Record<string, unknown>)[k],
      )}`,
  );
  return `{${props.join(',')}}`;
}

function computeNextAttemptAt(retryCount: number): Date {
  const baseMs = 1_000;
  const maxMs = 60_000;
  const exp = Math.min(maxMs, baseMs * 2 ** Math.min(retryCount, 10));
  const jitter = Math.floor(Math.random() * exp);
  return new Date(Date.now() + jitter);
}

@Injectable()
export class OrdersRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Section 4.7: server-side idempotent write path.
   * Following AI-Driven-Implementation-technical-guide.md Section 3.4 Uniqueness Invariant.
   */
  async upsertByExternalId(
    externalId: string,
    payload: Prisma.InputJsonValue,
  ): Promise<{ status: SyncResultStatus }> {
    const existing = await this.prisma.order.findUnique({
      where: { externalId },
      select: { payload: true, retryCount: true },
    });

    const now = new Date();
    const maxRetries = 10;

    if (!existing) {
      try {
        await this.prisma.order.create({
          data: {
            externalId,
            entityType: 'order',
            payload,
            syncStatus: 'IN_FLIGHT',
            retryCount: 0,
            nextAttemptAt: null,
            lastError: null,
          },
        });
        try {
          await this.prisma.order.update({
            where: { externalId },
            data: {
              syncStatus: 'SYNCED',
              nextAttemptAt: null,
              lastError: null,
              updatedAt: now,
            },
          });
        } catch (error) {
          await this.markRetryableOrDeadLetter({
            externalId,
            previousRetryCount: 0,
            maxRetries,
            reason:
              error instanceof Error ? error.message : 'internal_server_error',
          });
          throw error;
        }
        return { status: 'created' };
      } catch (error) {
        const raced = await this.prisma.order.findUnique({
          where: { externalId },
          select: { payload: true, retryCount: true },
        });
        if (!raced) throw error;
        return this.updateExisting(
          externalId,
          raced.payload,
          raced.retryCount,
          payload,
        );
      }
    }

    return this.updateExisting(
      externalId,
      existing.payload,
      existing.retryCount,
      payload,
    );
  }

  private async updateExisting(
    externalId: string,
    existingPayload: unknown,
    existingRetryCount: number,
    payload: Prisma.InputJsonValue,
  ): Promise<{ status: SyncResultStatus }> {
    const now = new Date();
    const maxRetries = 10;

    if (stableStringify(existingPayload) === stableStringify(payload)) {
      await this.prisma.order.update({
        where: { externalId },
        data: {
          syncStatus: 'SYNCED',
          nextAttemptAt: null,
          lastError: null,
          updatedAt: now,
        },
      });
      return { status: 'duplicate' };
    }

    try {
      await this.prisma.order.update({
        where: { externalId },
        data: {
          payload,
          syncStatus: 'IN_FLIGHT',
          nextAttemptAt: null,
          lastError: null,
          updatedAt: now,
        },
      });

      await this.prisma.order.update({
        where: { externalId },
        data: {
          syncStatus: 'SYNCED',
          nextAttemptAt: null,
          lastError: null,
          updatedAt: now,
        },
      });
    } catch (error) {
      await this.markRetryableOrDeadLetter({
        externalId,
        previousRetryCount: existingRetryCount,
        maxRetries,
        reason: error instanceof Error ? error.message : 'internal_server_error',
      });
      throw error;
    }

    return { status: 'updated' };
  }

  private async markRetryableOrDeadLetter(args: {
    externalId: string;
    previousRetryCount: number;
    maxRetries: number;
    reason: string;
  }): Promise<void> {
    const nextRetry = args.previousRetryCount + 1;
    if (nextRetry > args.maxRetries) {
      await this.prisma.order.update({
        where: { externalId: args.externalId },
        data: {
          syncStatus: 'DEAD_LETTER',
          retryCount: nextRetry,
          nextAttemptAt: null,
          lastError: args.reason,
        },
      });
      return;
    }

    await this.prisma.order.update({
      where: { externalId: args.externalId },
      data: {
        syncStatus: 'RETRYABLE_ERROR',
        retryCount: nextRetry,
        nextAttemptAt: computeNextAttemptAt(nextRetry),
        lastError: args.reason,
      },
    });
  }

  async recoverStuckInFlight(args: {
    staleAfterMs: number;
    maxRetries: number;
  }): Promise<number> {
    const cutoff = new Date(Date.now() - args.staleAfterMs);

    const stuck = await this.prisma.order.findMany({
      where: {
        syncStatus: 'IN_FLIGHT',
        updatedAt: { lt: cutoff },
      },
      select: { externalId: true, retryCount: true },
      take: 200,
    });

    let recovered = 0;
    for (const it of stuck) {
      const nextRetry = it.retryCount + 1;
      if (nextRetry > args.maxRetries) {
        await this.prisma.order.update({
          where: { externalId: it.externalId },
          data: {
            syncStatus: 'DEAD_LETTER',
            retryCount: nextRetry,
            nextAttemptAt: null,
            lastError: 'stale_in_flight',
          },
        });
      } else {
        await this.prisma.order.update({
          where: { externalId: it.externalId },
          data: {
            syncStatus: 'RETRYABLE_ERROR',
            retryCount: nextRetry,
            nextAttemptAt: computeNextAttemptAt(nextRetry),
            lastError: 'stale_in_flight',
          },
        });
      }
      recovered++;
    }

    return recovered;
  }

  async flushRetryableToSynced(limit: number): Promise<number> {
    const now = new Date();
    const due = await this.prisma.order.findMany({
      where: {
        syncStatus: 'RETRYABLE_ERROR',
        nextAttemptAt: { lte: now },
      },
      select: { externalId: true },
      take: limit,
    });

    for (const it of due) {
      await this.prisma.order.update({
        where: { externalId: it.externalId },
        data: {
          syncStatus: 'SYNCED',
          nextAttemptAt: null,
          lastError: null,
        },
      });
    }

    return due.length;
  }
}
