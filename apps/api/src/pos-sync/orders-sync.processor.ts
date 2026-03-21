import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrdersRepo } from './orders.repo';

@Injectable()
export class OrdersSyncProcessor {
  private readonly logger = new Logger(OrdersSyncProcessor.name);
  private readonly staleAfterMs = 60_000;
  private readonly maxRetries = 10;

  constructor(private readonly orders: OrdersRepo) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async flushRetries(): Promise<void> {
    const flushed = await this.orders.flushRetryableToSynced(50);
    if (flushed > 0) {
      this.logger.log({
        message: 'Flushed retryable orders to SYNCED',
        flushed,
      });
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async recoverStuckInFlight(): Promise<void> {
    const recovered = await this.orders.recoverStuckInFlight({
      staleAfterMs: this.staleAfterMs,
      maxRetries: this.maxRetries,
    });
    if (recovered > 0) {
      this.logger.warn({
        message: 'Recovered stuck IN_FLIGHT orders',
        recovered,
      });
    }
  }
}
