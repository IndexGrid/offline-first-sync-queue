DROP INDEX IF EXISTS "orders_sync_status_next_attempt_at_idx";
DROP INDEX IF EXISTS "orders_next_attempt_at_idx";

ALTER TABLE "orders" DROP COLUMN IF EXISTS "next_attempt_at";
