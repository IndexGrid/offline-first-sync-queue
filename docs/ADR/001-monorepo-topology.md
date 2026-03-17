# ADR 001: Monorepo Topology

## Status
Accepted

## Context
The project requires a tightly coupled contract between the frontend (client) and the backend (server) to ensure reliable offline synchronization. Managing separate repositories for these components increases the risk of contract drift and overhead in dependency management.

## Decision
We will use a Monorepo topology using **NPM Workspaces**.

### Structure:
- `apps/api`: NestJS backend.
- `apps/web`: Next.js frontend.
- `packages/sync-contract`: Shared validation schemas (Zod) and types.

## Consequences
- **Pros**: Single source of truth for contracts, simplified CI/CD orchestration, atomic changes across client/server.
- **Cons**: Requires explicit build order (contract first), slightly larger initial clone size.
