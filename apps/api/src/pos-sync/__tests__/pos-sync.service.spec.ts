import { Test, TestingModule } from '@nestjs/testing';
import { PosSyncService } from '../pos-sync.service';
import { OrdersRepo } from '../orders.repo';
import { SyncBatchRequest } from '@offline-pos/sync-contract';

describe('PosSyncService', () => {
  let service: PosSyncService;
  let ordersRepo: jest.Mocked<OrdersRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PosSyncService,
        {
          provide: OrdersRepo,
          useValue: {
            upsertByExternalId: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PosSyncService>(PosSyncService);
    ordersRepo = module.get(OrdersRepo);
  });

  describe('syncBatch', () => {
    it('should process valid orders successfully', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const input: SyncBatchRequest = {
        deviceId: 'pos-001',
        items: [
          {
            externalId: validUuid,
            entityType: 'order',
            payload: { customer: 'John Doe', total: 20.0 },
          },
        ],
      };

      ordersRepo.upsertByExternalId.mockResolvedValue({ status: 'created' });

      const { results } = await service.syncBatch(input);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        externalId: validUuid,
        status: 'created',
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(ordersRepo.upsertByExternalId).toHaveBeenCalledWith(
        validUuid,
        input.items[0].payload,
      );
    });

    it('should handle database errors per item', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const input: SyncBatchRequest = {
        deviceId: 'pos-001',
        items: [
          {
            externalId: validUuid,
            entityType: 'order',
            payload: { customer: 'John Doe', total: 20.0 },
          },
        ],
      };

      ordersRepo.upsertByExternalId.mockRejectedValue(
        new Error('Database error'),
      );

      const { results } = await service.syncBatch(input);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        externalId: validUuid,
        status: 'error',
        reason: 'Database error',
      });
    });

    it('should process multiple items with mixed results', async () => {
      const validUuid1 = '550e8400-e29b-41d4-a716-446655440000';
      const validUuid2 = '660e8400-e29b-41d4-a716-446655440001';

      const input: SyncBatchRequest = {
        deviceId: 'pos-001',
        items: [
          {
            externalId: validUuid1,
            entityType: 'order',
            payload: { customer: 'John', total: 10 },
          },
          {
            externalId: validUuid2,
            entityType: 'order',
            payload: { customer: 'Jane', total: 20 },
          },
        ],
      };

      ordersRepo.upsertByExternalId
        .mockResolvedValueOnce({ status: 'created' })
        .mockResolvedValueOnce({ status: 'updated' });

      const { results } = await service.syncBatch(input);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ externalId: validUuid1, status: 'created' });
      expect(results[1]).toEqual({ externalId: validUuid2, status: 'updated' });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(ordersRepo.upsertByExternalId).toHaveBeenCalledTimes(2);
    });
  });
});
