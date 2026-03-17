# @offline-pos/web

Next.js frontend application providing the POS dashboard and offline synchronization engine.

## 📡 Responsibilities
- **Offline First**: Uses IndexedDB to allow order creation without internet.
- **Sync Runner**: Background process that manages the synchronization queue states.
- **Observability**: Real-time visualization of sync progress and queue health.

## 🛠️ Key Scripts
- `npm run dev`: Starts the development server.
- `npm run test`: Runs integration tests using Vitest.
- `npm run build`: Compiles the optimized production build.

## 🏗️ Architecture
- **Sync Engine**: Located in `src/lib/sync/`. Handles enqueueing, retries, and batching.
- **IndexedDB**: Managed in `src/lib/db.ts`. Stores orders and the sync queue.
- **Components**: Tailwind-styled React components for the POS UI.
