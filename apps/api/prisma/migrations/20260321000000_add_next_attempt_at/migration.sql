ALTER TABLE "orders" ADD COLUMN "next_attempt_at" TIMESTAMP(3);

CREATE INDEX "orders_next_attempt_at_idx" ON "orders"("next_attempt_at");

CREATE INDEX "orders_sync_status_next_attempt_at_idx" ON "orders"("sync_status", "next_attempt_at");
