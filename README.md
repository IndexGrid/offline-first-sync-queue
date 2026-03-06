# Offline-First POS System with Batch Sync

[![CI](https://github.com/IndexGrid/offline-first-sync-queue/actions/workflows/ci.yml/badge.svg)](https://github.com/IndexGrid/offline-first-sync-queue/actions/workflows/ci.yml)

This project implements a Point of Sale (POS) system with **offline-first** support and automatic batch synchronization. The system allows creating orders even without an internet connection and automatically synchronizes once the connection is restored.

## 📁 Repository Structure

```text
.
├── frontend/               # Next.js web application
│   ├── src/
│   │   ├── components/    # UI Components (OrderForm, SyncDashboard, etc.)
│   │   ├── lib/
│   │   │   ├── db.ts      # IndexedDB schema and configuration
│   │   │   └── sync/      # Sync engine (runner, enqueue, retry, lock)
│   │   └── app/           # Next.js App Router pages
│   └── .env.example       # Frontend environment template
├── frontend/backend/       # NestJS API application
│   ├── src/
│   │   ├── pos-sync/      # Core logic (Controller, Service, Repo)
│   │   └── main.ts        # Entry point
│   └── .env.example       # Backend environment template
├── docker-compose.yml      # Infrastructure orchestration
├── init.sql                # PostgreSQL initial schema
└── README.md               # Documentation
```

## 🚀 Features

### Frontend (Next.js + IndexedDB)
- ✅ **Offline Order Creation** - Works without an internet connection.
- ✅ **Sync Queue** - Intelligent local queue management with states.
- ✅ **Batch Sync** - Optimized batch sending with automatic retry.
- ✅ **Monitoring Dashboard** - Real-time visualization of sync status.
- ✅ **Local Deduplication** - Prevents duplicate orders from double-clicks.
- ✅ **Robust Error Handling** - Retry with exponential backoff and jitter.

### Backend (NestJS + PostgreSQL)
- ✅ **Idempotent REST API** - Secure processing with unique `externalId`.
- ✅ **Per-item Validation** - Each item is validated individually without affecting the whole batch.
- ✅ **Smart Upsert** - Detects creation, update, or duplication.
- ✅ **PostgreSQL Integration** - Persistent storage with optimized indexes.

## 📡 API Contract

### Batch Synchronization
`POST /admin/pos/sync`

**Request Body:**
```json
{
  "deviceId": "pos-001",
  "orders": [
    {
      "externalId": "550e8400-e29b-41d4-a716-446655440000",
      "data": {
        "items": [{"sku": "PROD001", "qty": 2, "price": 10.00}],
        "total": 20.00,
        "customer": "John Doe"
      }
    },
    {
      "externalId": "invalid-uuid",
      "data": { "items": [], "total": 0 }
    }
  ]
}
```

**Response Body (201 Created):**
```json
{
  "results": [
    {
      "externalId": "550e8400-e29b-41d4-a716-446655440000",
      "status": "created" 
    },
    {
      "externalId": "invalid-uuid",
      "status": "invalid",
      "reason": "externalId must be a UUID"
    }
  ]
}
```
*Possible statuses: `created`, `updated`, `duplicate`, `invalid`, `auth_required`, `error`.*

## 📋 Workflow

### 1. Offline Order Creation
1. User fills out the order form.
2. System generates a unique `externalId` (UUID v4) on the client.
3. Order is saved in IndexedDB with `LOCAL_ONLY` status.
4. A synchronization event is created in the queue with `PENDING` status.
5. Immediate confirmation is shown to the user.

### 2. Batch Synchronization
1. Runner detects an online connection or interval (15s).
2. Collects up to 50 `PENDING` items from the local queue.
3. Groups by endpoint and splits into chunks (max 256KB).
4. Sends the batch to the backend with optional gzip compression.
5. Processes the response item by item, updating local states.
6. Marks orders as `SYNCED` or `ERROR` based on the response.

## 🛠️ Installation and Execution

### Option 1: Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/IndexGrid/offline-first-sync-queue.git
cd offline-first-sync-queue

# Start all services
docker-compose up -d --build
```

### Option 2: Local Development

1. **Setup Backend**:
   ```bash
   cd frontend/backend
   cp .env.example .env
   npm install
   npm run start:dev
   ```
2. **Setup Frontend**:
   ```bash
   cd frontend
   cp .env.example .env.local
   npm install
   npm run dev
   ```

## 🧪 Testing Scenarios

### 1. Happy Path (Online)
- Create an order at `http://localhost:3000`.
- Observe the order list: status should transition from `LOCAL_ONLY` to `SYNCED` within seconds.
- Verify in database: `docker exec -it postgres psql -U postgres -d app -c "SELECT * FROM orders;"`

### 2. Offline Resilience
- Turn off your internet or set Chrome DevTools to **Offline**.
- Create 3 orders. They will remain as `LOCAL_ONLY`.
- Check `http://localhost:3000/sync/status` to see 3 items in `PENDING` state.
- Restore connection. Observe automatic synchronization.

### 3. Idempotency & Conflict
- The system prevents duplicates even if the same request is sent twice (e.g., network retry).
- The backend uses `ON CONFLICT (external_id) DO UPDATE` to ensure consistency.

## 🧠 Design Decisions & Trade-offs

| Decision | Rationale |
| :--- | :--- |
| **IndexedDB vs localStorage** | IndexedDB is asynchronous, supports larger data volumes, and allows complex indexing, which is essential for a sync queue. |
| **Batch size (50)** | Balances request overhead and payload size. Prevents timeouts while keeping throughput high. |
| **Payload limit (256KB)** | Avoids hitting default server body-parser limits and ensures reliable transmission on weak connections. |
| **Dedupe best-effort** | Uses FNV-1a hashing on the client with a 2-second window to prevent UI-level accidental double-submissions. |
| **Single-tab locking** | To prevent race conditions where multiple tabs try to process the same sync queue simultaneously. |

## 🚨 Known Limitations

- **No CRDT/merge**: Eventual consistency only. Last-write-wins at the record level.
- **No Service Worker**: Synchronization only happens while the app is open in a tab.

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
