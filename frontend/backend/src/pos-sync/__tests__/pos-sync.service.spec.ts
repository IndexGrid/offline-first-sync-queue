import { Test, TestingModule } from '@nestjs/testing';
import { PosSyncService } from '../pos-sync.service';
import { OrdersRepo } from '../orders.repo';

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
      const items = [
        {
          externalId: validUuid,
          data: { customer: 'John Doe', total: 20.00 },
        },
      ];

      ordersRepo.upsertByExternalId.mockResolvedValue({ status: 'created' });

      const results = await service.syncBatch(items);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        externalId: validUuid,
        status: 'created',
      });
      expect(ordersRepo.upsertByExternalId).toHaveBeenCalledWith(
        validUuid,
        items[0].data,
      );
    });

    it('should handle missing externalId', async () => {
      const items = [
        {
          externalId: '',
          data: { customer: 'John Doe', total: 20.00 },
        },
      ];

      const results = await service.syncBatch(items);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        externalId: '',
        status: 'invalid',
        reason: 'missing_externalId',
      });
      expect(ordersRepo.upsertByExternalId).not.toHaveBeenCalled();
    });

    it('should handle invalid UUID format', async () => {
      const items = [
        {
          externalId: 'invalid-uuid',
          data: { customer: 'John Doe', total: 20.00 },
        },
      ];

      const results = await service.syncBatch(items);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        externalId: 'invalid-uuid',
        status: 'invalid',
        reason: 'invalid_externalId',
      });
      expect(ordersRepo.upsertByExternalId).not.toHaveBeenCalled();
    });

    it('should handle invalid data', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const items = [
        {
          externalId: validUuid,
          data: null,
        },
      ];

      const results = await service.syncBatch(items);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        externalId: validUuid,
        status: 'invalid',
        reason: 'invalid_data',
      });
      expect(ordersRepo.upsertByExternalId).not.toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const items = [
        {
          externalId: validUuid,
          data: { customer: 'John Doe', total: 20.00 },
        },
      ];

      ordersRepo.upsertByExternalId.mockRejectedValue(new Error('Database error'));

      const results = await service.syncBatch(items);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        externalId: validUuid,
        status: 'error',
        reason: 'db_error',
      });
    });

    it('should process multiple items with mixed results', async () => {
      const validUuid1 = '550e8400-e29b-41d4-a716-446655440000';
      const validUuid2 = '660e8400-e29b-41d4-a716-446655440001';
      const invalidUuid = 'invalid-uuid';

      const items = [
        { externalId: validUuid1, data: { customer: 'John Doe', total: 20.00 } },
        { externalId: invalidUuid, data: { customer: 'Jane Doe', total: 15.00 } },
        { externalId: validUuid2, data: null },
        { externalId: '', data: { customer: 'Bob Smith', total: 30.00 } },
      ];

      ordersRepo.upsertByExternalId
        .mockResolvedValueOnce({ status: 'created' })
        .mockResolvedValueOnce({ status: 'updated' });

      const results = await service.syncBatch(items);

      expect(results).toHaveLength(4);
      expect(results[0]).toEqual({ externalId: validUuid1, status: 'created' });
      expect(results[1]).toEqual({ externalId: invalidUuid, status: 'invalid', reason: 'invalid_externalId' });
      expect(results[2]).toEqual({ externalId: validUuid2, status: 'invalid', reason: 'invalid_data' });
      expect(results[3]).toEqual({ externalId: '', status: 'invalid', reason: 'missing_externalId' });
      
      expect(ordersRepo.upsertByExternalId).toHaveBeenCalledTimes(2);
    });
  });
});