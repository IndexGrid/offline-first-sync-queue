import { Test, TestingModule } from '@nestjs/testing';
import { PosSyncController } from '../pos-sync.controller';
import { PosSyncService } from '../pos-sync.service';
import { SyncBatchRequestTransport } from '@offline-pos/sync-contract';

describe('PosSyncController', () => {
  let controller: PosSyncController;
  let service: jest.Mocked<PosSyncService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PosSyncController],
      providers: [
        {
          provide: PosSyncService,
          useValue: {
            syncBatch: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<PosSyncController>(PosSyncController);
    service = module.get(PosSyncService);
  });

  it('should call service.syncBatch with dto', async () => {
    const dto: SyncBatchRequestTransport = {
      deviceId: 'dev-1',
      items: [],
    };
    service.syncBatch.mockResolvedValue({ results: [] });

    await controller.sync(dto);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(service.syncBatch).toHaveBeenCalledWith(dto, undefined);
  });
});
