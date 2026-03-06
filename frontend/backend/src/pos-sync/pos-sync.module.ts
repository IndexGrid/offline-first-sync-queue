import { Module, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { PosSyncController } from './pos-sync.controller';
import { PosSyncService } from './pos-sync.service';
import { OrdersRepo } from './orders.repo';

@Module({
  controllers: [PosSyncController],
  providers: [
    PosSyncService,
    OrdersRepo,
    {
      provide: Pool,
      useFactory: () => new Pool({ connectionString: process.env.DATABASE_URL }),
    },
  ],
})
export class PosSyncModule implements OnModuleDestroy {
  constructor(private readonly pool: Pool) {}
  async onModuleDestroy() {
    await this.pool.end();
  }
}