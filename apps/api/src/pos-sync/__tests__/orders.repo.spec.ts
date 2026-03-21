import { Test, TestingModule } from '@nestjs/testing';
import { OrdersRepo } from '../orders.repo';
import { PrismaService } from '../../prisma.service';

describe('OrdersRepo', () => {
  let repo: OrdersRepo;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersRepo,
        {
          provide: PrismaService,
          useValue: {
            order: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    repo = module.get<OrdersRepo>(OrdersRepo);
    prisma = module.get(PrismaService);
  });

  describe('upsertByExternalId', () => {
    const externalId = 'ext-1';
    const payload = { foo: 'bar' };

    it('should create if not exists', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);

      (prisma.order.create as jest.Mock).mockResolvedValue({} as any);
      (prisma.order.update as jest.Mock).mockResolvedValue({} as any);

      const result = await repo.upsertByExternalId(externalId, payload);

      expect(result.status).toBe('created');

      const orderDelegate = prisma.order as unknown as Record<string, unknown>;
      const createMock = orderDelegate['create'] as jest.Mock;
      expect(createMock).toHaveBeenCalled();
    });

    it('should return duplicate if payload is identical', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        payload,
        retryCount: 0,
      } as any);
      (prisma.order.update as jest.Mock).mockResolvedValue({} as any);

      const result = await repo.upsertByExternalId(externalId, payload);

      expect(result.status).toBe('duplicate');

      const orderDelegate = prisma.order as unknown as Record<string, unknown>;
      const updateMock = orderDelegate['update'] as jest.Mock;
      expect(updateMock).toHaveBeenCalledTimes(1);
    });

    it('should update if payload changed', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        payload: { foo: 'old' },
        retryCount: 0,
      } as any);

      (prisma.order.update as jest.Mock).mockResolvedValue({} as any);

      const result = await repo.upsertByExternalId(externalId, payload);

      expect(result.status).toBe('updated');

      const orderDelegate = prisma.order as unknown as Record<string, unknown>;
      const updateMock = orderDelegate['update'] as jest.Mock;
      expect(updateMock).toHaveBeenCalledTimes(2);
    });

    it('should handle create race by falling back to existing record', async () => {
      (prisma.order.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ payload, retryCount: 0 } as any);
      (prisma.order.create as jest.Mock).mockRejectedValue(new Error('unique'));
      (prisma.order.update as jest.Mock).mockResolvedValue({} as any);

      const result = await repo.upsertByExternalId(externalId, payload);

      expect(result.status).toBe('duplicate');
    });
  });

  describe('recoverStuckInFlight', () => {
    it('should move stuck IN_FLIGHT to RETRYABLE_ERROR or DEAD_LETTER', async () => {
      (prisma.order.findMany as jest.Mock).mockResolvedValue([
        { externalId: 'a', retryCount: 0 },
        { externalId: 'b', retryCount: 10 },
      ]);
      (prisma.order.update as jest.Mock).mockResolvedValue({} as any);

      const recovered = await repo.recoverStuckInFlight({
        staleAfterMs: 60_000,
        maxRetries: 10,
      });

      expect(recovered).toBe(2);
    });
  });

  describe('flushRetryableToSynced', () => {
    it('should mark due retryable items as SYNCED', async () => {
      (prisma.order.findMany as jest.Mock).mockResolvedValue([
        { externalId: 'a' },
        { externalId: 'b' },
      ]);
      (prisma.order.update as jest.Mock).mockResolvedValue({} as any);

      const flushed = await repo.flushRetryableToSynced(50);

      expect(flushed).toBe(2);
    });
  });
});
