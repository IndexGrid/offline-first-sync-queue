# ADR 003: Migration Rollback Policy

## Status
Accepted

## Context
The project uses Prisma migrations for schema evolution. Prisma migrations are append-only and typically do not ship automatic down migrations. The technical guide requires schema changes to be reversible when possible.

## Decision
Each migration directory under `apps/api/prisma/migrations/*` must include one of:
- `rollback.sql` when a safe rollback exists, or
- `non_reversible.md` when rollback is not feasible or safe.

A CI gate enforces the presence of one of these files for every migration directory.

## Consequences
- Rollback procedures become explicit and reviewable during PRs.
- Reversibility is enforced as governance even though Prisma does not execute down migrations automatically.
