# @offline-pos/api

NestJS service responsible for the server-side logic of the Offline-First POS system.

## 📡 Responsibilities
- **Idempotent Sync**: Processes batch requests from POS devices via `POST v1/pos/sync`.
- **Contract Enforcement**: Strict runtime validation using Zod schemas from `@offline-pos/sync-contract`.
- **Persistence**: Managed via Prisma ORM with PostgreSQL.

## 🛠️ Key Scripts
- `npm run prisma:migrate`: Deploys database migrations.
- `npm run test:cov`: Runs unit tests with coverage reporting.
- `npm run lint`: Enforces code style and best practices.

## 🏗️ Architecture
- **Controllers**: Entry point for HTTP requests.
- **Services**: Business logic (sync reconciliation, idempotency).
- **Repositories**: Data access layer via Prisma.
- **Pipes**: Global `ZodValidationPipe` for contract hardening.
