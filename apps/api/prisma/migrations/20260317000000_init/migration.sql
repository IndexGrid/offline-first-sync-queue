-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL DEFAULT 'order',
    "payload" JSONB NOT NULL,
    "sync_status" TEXT NOT NULL DEFAULT 'PENDING',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_external_id_key" ON "orders"("external_id");

-- CreateIndex
CREATE INDEX "orders_external_id_idx" ON "orders"("external_id");

-- CreateIndex
CREATE INDEX "orders_sync_status_idx" ON "orders"("sync_status");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- CreateIndex
CREATE INDEX "orders_updated_at_idx" ON "orders"("updated_at");
