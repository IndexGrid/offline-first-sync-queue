import { Module } from '@nestjs/common';
import { PosSyncController } from './pos-sync.controller';
import { PosSyncService } from './pos-sync.service';
import { OrdersRepo } from './orders.repo';
import { PrismaService } from '../prisma.service';
import { OrdersSyncProcessor } from './orders-sync.processor';

@Module({
  controllers: [PosSyncController],
  providers: [PosSyncService, OrdersRepo, PrismaService, OrdersSyncProcessor],
  exports: [PosSyncService],
})
export class PosSyncModule {}
