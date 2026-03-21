Type: minor
Scope: repo
Breaking: no
Migration: Apply Prisma migrations via prisma migrate deploy in CI and production.
Rollback: Use rollback.sql in the latest migration directory if a revert is required.
Compatibility: Backward compatible for existing clients; contract changes are additive.

Summary:
- Add contract test suite and run backend e2e in CI.
- Enforce migration rollback policy (rollback.sql or non_reversible.md).
