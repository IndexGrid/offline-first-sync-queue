# ADR 002: Shared Contract Validation

## Status
Accepted

## Context
The synchronization between client and server must be strictly validated at runtime to prevent data corruption or inconsistencies in an offline-first environment. Type-only validation is insufficient.

## Decision
We will use **Zod** as the primary validation engine for the shared sync contract (`packages/sync-contract`).

### Enforcement:
- **Frontend**: Used in `IndexedDB` schemas and before transmission in the `runner`.
- **Backend**: Used in `PosSyncController` as the runtime validation gate at the transport boundary (via `ValidationPipe` or direct Zod parsing).

## Consequences
- **Pros**: Strong runtime guarantees, single schema definition shared by both ends, type-safety derived from schema.
- **Cons**: Performance overhead for parsing (negligible for our use case).
