import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PosSyncModule } from './pos-sync/pos-sync.module';

@Module({
  imports: [ScheduleModule.forRoot(), PosSyncModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
