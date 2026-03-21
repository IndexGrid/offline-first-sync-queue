import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PosSyncController } from '../src/pos-sync/pos-sync.controller';
import { PosSyncService } from '../src/pos-sync/pos-sync.service';
import { OrdersRepo } from '../src/pos-sync/orders.repo';
import {
  SyncBatchResponseSchema,
  type SyncBatchRequestTransport,
} from '@offline-pos/sync-contract';

describe('Sync contract (HTTP boundary)', () => {
  let app: INestApplication<App>;
  let ordersRepo: jest.Mocked<OrdersRepo>;

  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    process.env = { ...originalEnv };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [PosSyncController],
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

    app = moduleFixture.createNestApplication();
    await app.init();

    ordersRepo = moduleFixture.get(OrdersRepo);
  });

  afterAll(async () => {
    process.env = originalEnv;
    await app.close();
  });

  it('isolates invalid items and still returns per-item results', async () => {
    const validUuid = '550e8400-e29b-41d4-a716-446655440000';
    const body: SyncBatchRequestTransport = {
      deviceId: 'pos-001',
      items: [
        {
          externalId: validUuid,
          entityType: 'order',
          payload: { total: 10 },
        },
        {
          externalId: 'not-a-uuid',
          entityType: 'order',
          payload: { total: 20 },
        },
      ],
    };

    ordersRepo.upsertByExternalId.mockResolvedValue({ status: 'created' });

    const res = await request(app.getHttpServer())
      .post('/v1/pos/sync')
      .send(body)
      .expect(201);

    const parsed = SyncBatchResponseSchema.parse(res.body);
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0]).toEqual({
      externalId: validUuid,
      status: 'created',
    });
    expect(parsed.results[1].status).toBe('invalid');

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(ordersRepo.upsertByExternalId).toHaveBeenCalledTimes(1);
  });

  it('returns auth_required when SYNC_API_KEY is configured and missing/mismatch', async () => {
    process.env.SYNC_API_KEY = 'expected';

    const body: SyncBatchRequestTransport = {
      deviceId: 'pos-001',
      items: [
        {
          externalId: '550e8400-e29b-41d4-a716-446655440000',
          entityType: 'order',
          payload: { total: 10 },
        },
      ],
    };

    const res = await request(app.getHttpServer())
      .post('/v1/pos/sync')
      .send(body)
      .expect(201);

    const parsed = SyncBatchResponseSchema.parse(res.body);
    expect(parsed.results).toEqual([
      {
        externalId: '550e8400-e29b-41d4-a716-446655440000',
        status: 'auth_required',
        reason: 'invalid_api_key',
      },
    ]);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(ordersRepo.upsertByExternalId).not.toHaveBeenCalled();
  });

  it('reports duplicate replay deterministically', async () => {
    delete process.env.SYNC_API_KEY;

    const seen = new Set<string>();
    ordersRepo.upsertByExternalId.mockImplementation((externalId) => {
      if (seen.has(externalId)) return Promise.resolve({ status: 'duplicate' });
      seen.add(externalId);
      return Promise.resolve({ status: 'created' });
    });

    const externalId = '550e8400-e29b-41d4-a716-446655440000';
    const body: SyncBatchRequestTransport = {
      deviceId: 'pos-001',
      items: [
        {
          externalId,
          entityType: 'order',
          payload: { total: 10 },
        },
      ],
    };

    const res1 = await request(app.getHttpServer())
      .post('/v1/pos/sync')
      .send(body)
      .expect(201);
    const parsed1 = SyncBatchResponseSchema.parse(res1.body);
    expect(parsed1.results[0].status).toBe('created');

    const res2 = await request(app.getHttpServer())
      .post('/v1/pos/sync')
      .send(body)
      .expect(201);
    const parsed2 = SyncBatchResponseSchema.parse(res2.body);
    expect(parsed2.results[0].status).toBe('duplicate');
  });
});
