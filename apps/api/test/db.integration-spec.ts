import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

describe('Database discipline (Prisma + Postgres)', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for integration tests');
    }
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.order.deleteMany();
  });

  it('enforces uniqueness on externalId', async () => {
    const externalId = randomUUID();

    await prisma.order.create({
      data: {
        externalId,
        entityType: 'order',
        payload: { total: 1 },
      },
    });

    await expect(
      prisma.order.create({
        data: {
          externalId,
          entityType: 'order',
          payload: { total: 2 },
        },
      }),
    ).rejects.toBeTruthy();
  });

  it('persists nextAttemptAt for retry scheduling', async () => {
    const externalId = randomUUID();
    const nextAttemptAt = new Date(Date.now() + 60_000);

    const created = await prisma.order.create({
      data: {
        externalId,
        entityType: 'order',
        payload: { total: 1 },
        nextAttemptAt,
      },
    });

    expect(created.nextAttemptAt?.toISOString()).toBe(nextAttemptAt.toISOString());
  });

  it('has indexes for retry scheduling lookup', async () => {
    const rows = await prisma.$queryRaw<
      Array<{ indexname: string }>
    >`SELECT indexname FROM pg_indexes WHERE tablename = 'orders'`;
    const names = new Set(rows.map((r) => r.indexname));

    expect(names.has('orders_next_attempt_at_idx')).toBe(true);
    expect(names.has('orders_sync_status_next_attempt_at_idx')).toBe(true);
  });
});
