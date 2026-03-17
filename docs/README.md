# Project Documentation

This directory contains the detailed documentation for the Offline-First POS System.

## 📁 Monorepo Structure

```text
.
├── apps/
│   ├── api/               # NestJS API (PostgreSQL + Prisma)
│   └── web/               # Next.js Frontend (IndexedDB)
├── packages/
│   └── sync-contract/     # Shared Zod schemas & TS types
├── infra/
│   └── docker-compose.yml # Orchestration
└── docs/
    ├── ADR/               # Architectural Decision Records
    ├── RUNBOOK.md         # Operational Guide
    └── README.md          # You are here
```

## 📡 Sync API Contract (v1)

### Batch Synchronization
`POST v1/pos/sync`

**Request Body:**
```json
{
  "deviceId": "pos-001",
  "items": [
    {
      "externalId": "550e8400-e29b-41d4-a716-446655440000",
      "entityType": "order",
      "payload": {
        "items": [{"sku": "PROD001", "qty": 2, "price": 10.00}],
        "total": 20.00,
        "customer": "John Doe"
      }
    }
  ]
}
```

**Response Body:**
```json
{
  "results": [
    {
      "externalId": "550e8400-e29b-41d4-a716-446655440000",
      "status": "created" 
    }
  ]
}
```
*Possible statuses: `created`, `updated`, `duplicate`, `invalid`, `auth_required`, `error`.*

## 🔄 Synchronization Workflow

1. **Local Creation**: Data is saved to IndexedDB with `LOCAL_ONLY` status.
2. **Queueing**: A sync event is added to the `syncQueue` as `PENDING`.
3. **Runner**: The background runner collects `PENDING` items, groups them by endpoint, and marks them `IN_FLIGHT`.
4. **Transport**: Batches are sent via `POST v1/pos/sync` (optionally gzipped).
5. **Reconciliation**:
   - `created`/`updated`/`duplicate` -> Local state becomes `SYNCED`.
   - `invalid`/`error` -> Local state transitions to `FATAL_ERROR` or `RETRYABLE_ERROR`.
6. **Recovery**: Items stuck in `IN_FLIGHT` for too long are automatically requeued.

## 🛠️ Operational Guides
- [Architecture Decision Records (ADRs)](ADR/README.md)
- [Local Development Guide](../README.md#local-development)
- [CI/CD Pipeline](../.github/workflows/ci.yml)
