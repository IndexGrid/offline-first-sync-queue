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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (prisma.order.create as jest.Mock).mockResolvedValue({} as any);

      const result = await repo.upsertByExternalId(externalId, payload);

      expect(result.status).toBe('created');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(prisma.order.create).toHaveBeenCalled();
    });

    it('should return duplicate if payload is identical', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        payload,
      } as any);

      const result = await repo.upsertByExternalId(externalId, payload);

      expect(result.status).toBe('duplicate');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('should update if payload changed', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        payload: { foo: 'old' },
      } as any);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (prisma.order.update as jest.Mock).mockResolvedValue({} as any);

      const result = await repo.upsertByExternalId(externalId, payload);

      expect(result.status).toBe('updated');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(prisma.order.update).toHaveBeenCalled();
    });
  });
});
