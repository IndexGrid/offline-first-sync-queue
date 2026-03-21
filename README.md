# Offline-First POS Monorepo

[![CI](https://github.com/IndexGrid/offline-first-sync-queue/actions/workflows/ci.yml/badge.svg)](https://github.com/IndexGrid/offline-first-sync-queue/actions/workflows/ci.yml)

Deterministic, testable, and operationally credible reference implementation of an offline-first Point of Sale (POS) system with batch synchronization.

## 🏗️ Repository Topology
This project is organized as a monorepo using NPM Workspaces:
- **[apps/api](apps/api)**: NestJS backend service with Prisma and PostgreSQL.
- **[apps/web](apps/web)**: Next.js frontend application with IndexedDB.
- **[packages/sync-contract](packages/sync-contract)**: Shared Zod schemas and TypeScript types (the "Single Source of Truth").
- **[infra](infra)**: Docker orchestration and database configuration.
- **[docs](docs)**: Architecture Decision Records (ADRs), technical guides, and runbooks.

## 🛡️ Core Invariants
1. **Idempotency**: Client-generated keys (`externalId`) with server-side `ON CONFLICT` enforcement.
2. **State Machine**: Explicit sync transitions (`PENDING` -> `IN_FLIGHT` -> `SYNCED` | `RETRYABLE_ERROR` | `FATAL_ERROR` | `DEAD_LETTER`).
3. **Database Discipline**: Versioned migrations via Prisma (no manual SQL execution in production).
4. **API Hardening**: Versioned endpoints (`v1/pos/sync`) with strict runtime validation.

## 🚀 Getting Started

### Prerequisites
- Node.js >= 20
- Docker & Docker Compose

### Quick Start (Docker)
```bash
# Clone and enter
git clone https://github.com/IndexGrid/offline-first-sync-queue.git
cd offline-first-sync-queue

# Start infrastructure and apps
docker-compose -f infra/docker-compose.yml up -d
```
Access the dashboard at `http://localhost:3000` and the API at `http://localhost:3001`.

### Local Development
```bash
# Install all dependencies
npm install

# Build shared contract first
npm run build -w packages/sync-contract

# Start services
npm run dev # (If global dev script is configured)
# OR
npm run start:dev -w apps/api
npm run dev -w apps/web
```

## 📊 Observability
- **Backend Logs**: Structured logs via NestJS Logger.
- **Frontend Telemetry**: Real-time sync queue depth and status distribution signals.

## 📄 Documentation
- [Technical Guide](AI-Driven-Implementation-technical-guide%20(1).md)
- [Architecture Decision Records (ADRs)](docs/ADR/README.md)
- [Project Documentation](docs/README.md)

---
Licensed under MIT. Copyright (c) 2026 Index Grid.
