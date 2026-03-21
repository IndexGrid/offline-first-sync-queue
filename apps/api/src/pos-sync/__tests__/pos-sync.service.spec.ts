import { Test, TestingModule } from '@nestjs/testing';
import { PosSyncService } from '../pos-sync.service';
import { OrdersRepo } from '../orders.repo';
import { SyncBatchRequestTransport } from '@offline-pos/sync-contract';

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
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should process valid orders successfully', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const input: SyncBatchRequestTransport = {
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
      expect(ordersRepo.upsertByExternalId).toHaveBeenCalledWith(validUuid, {
        customer: 'John Doe',
        total: 20.0,
      });
    });

    it('should handle database errors per item', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const input: SyncBatchRequestTransport = {
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
        status: 'retriable_error',
        reason: 'Database error',
      });
    });

    it('should process multiple items with mixed results', async () => {
      const validUuid1 = '550e8400-e29b-41d4-a716-446655440000';
      const validUuid2 = '660e8400-e29b-41d4-a716-446655440001';

      const input: SyncBatchRequestTransport = {
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

    it('should handle duplicate items', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const input: SyncBatchRequestTransport = {
        deviceId: 'pos-001',
        items: [
          {
            externalId: validUuid,
            entityType: 'order',
            payload: { customer: 'John Doe', total: 20.0 },
          },
        ],
      };

      ordersRepo.upsertByExternalId.mockResolvedValue({ status: 'duplicate' });

      const { results } = await service.syncBatch(input);

      expect(results[0]).toEqual({
        externalId: validUuid,
        status: 'duplicate',
      });
    });

    it('should isolate invalid items and still process valid ones', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const input: SyncBatchRequestTransport = {
        deviceId: 'pos-001',
        items: [
          {
            externalId: validUuid,
            entityType: 'order',
            payload: { customer: 'John Doe', total: 20.0 },
          },
          {
            externalId: 'not-a-uuid',
            entityType: 'order',
            payload: { total: 1 },
          },
        ],
      };

      ordersRepo.upsertByExternalId.mockResolvedValue({ status: 'created' });

      const { results } = await service.syncBatch(input);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ externalId: validUuid, status: 'created' });
      expect(results[1].status).toBe('invalid');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(ordersRepo.upsertByExternalId).toHaveBeenCalledTimes(1);
    });

    it('should return auth_required for every item when api key is invalid', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const input: SyncBatchRequestTransport = {
        deviceId: 'pos-001',
        items: [
          {
            externalId: validUuid,
            entityType: 'order',
            payload: { customer: 'John Doe', total: 20.0 },
          },
        ],
      };

      process.env.SYNC_API_KEY = 'expected';

      const { results } = await service.syncBatch(input, 'wrong');

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('auth_required');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(ordersRepo.upsertByExternalId).not.toHaveBeenCalled();
    });
  });
});
