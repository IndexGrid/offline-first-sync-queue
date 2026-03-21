# AI-Driven Implementation Guide

## Objective
Transform this repository into a deterministic, testable, releaseable, and operationally credible reference implementation.  
The AI is the primary code producer; therefore, implementation must be constrained by explicit technical contracts, not prose.

## Implementation Directives

### 1. Repository Topology
- Enforce a single monorepo convention.
- Separate runnable applications from shared packages.
- Prohibit ambiguous nesting between application layers.
- Standardize:
  - `apps/*` for deployables
  - `packages/*` for shared libraries/contracts
  - `infra/*` for container/db/runtime assets
  - `docs/*` for architecture/ADR/runbooks

### 2. Package and License Consistency
- All package manifests must inherit the repository license.
- No package may declare `UNLICENSED` if the repository is open-source.
- Every package must define:
  - `name`
  - `version`
  - `private`
  - `license`
  - `repository`
  - `engines`
  - `scripts`

### 3. Database Discipline
- Replace bootstrap-only SQL with versioned migrations.
- Schema changes must be append-only and reversible when possible.
- Every table requiring deduplication must have a database-enforced uniqueness invariant.
- Add explicit indexes for:
  - idempotency key lookup
  - sync status lookup
  - retry scheduling lookup
  - created/updated ordering

### 4. Sync Semantics as Contracts
The AI must implement sync behavior as explicit state machines, not ad-hoc conditionals.

Required invariants:
- client-generated idempotency key
- at-least-once delivery tolerance
- server-side idempotent write path
- per-item result reporting
- deterministic retry eligibility
- dead-letter terminal state
- stuck `IN_FLIGHT` recovery

Minimum states:
- `PENDING`
- `IN_FLIGHT`
- `SYNCED`
- `RETRYABLE_ERROR`
- `FATAL_ERROR`
- `DEAD_LETTER`

### 5. API Contract Hardening
- Version all external sync endpoints.
- Validate payloads at transport boundary.
- Return per-item status, never opaque batch-only success.
- Distinguish:
  - validation failure
  - duplicate/idempotent replay
  - retriable server failure
  - authorization failure
  - partial batch success
- Contract definitions must be generated from shared schemas.

### 6. Test Matrix
The AI must not consider implementation complete without the following automated coverage:

#### Unit
- state transition rules
- retry/backoff policy
- payload chunking rules
- deduplication logic
- idempotent upsert behavior

#### Integration
- DB uniqueness enforcement
- migration application
- queue persistence/recovery
- partial batch processing

#### Contract
- request/response schema compatibility
- invalid item isolation
- duplicate replay behavior

#### End-to-End
- offline enqueue
- reconnect sync
- partial success reconciliation
- crash during `IN_FLIGHT`
- resume after restart

#### Failure Injection
- network timeout
- 5xx retry path
- malformed payload rejection
- oversized payload split
- duplicate external identifier replay

### 7. CI Quality Gates
CI must fail unless all gates pass:
- format
- lint
- typecheck
- unit tests
- integration tests
- contract tests
- e2e tests
- migration check
- build for all apps
- coverage threshold

Minimum policy:
- no direct merge on red pipeline
- no release from untagged commit
- no schema change without migration test

### 8. Observability
The AI must emit structured telemetry for all sync-critical paths.

Required signals:
- queue depth
- retry count
- dead-letter count
- batch size
- per-status response distribution
- sync latency
- recovery-from-stuck count

Logs must be:
- structured
- correlation-aware
- idempotency-key searchable

### 9. Documentation Rules
Documentation must map claims to implementation evidence.

Every architectural claim must link to at least one of:
- source module
- automated test
- ADR
- runbook

Prohibited:
- generic boilerplate READMEs
- undocumented runtime assumptions
- undocumented environment variables
- undocumented recovery procedures

### 10. Release and Change Control
- Adopt semantic versioning.
- Maintain changelog from merged changes.
- Publish tagged releases only from green CI.
- Any breaking API/storage change requires:
  - migration note
  - compatibility statement
  - rollback note

## AI Output Contract

For every implementation task, the AI must produce:

1. **Files changed**
2. **Invariant introduced or preserved**
3. **Failure modes covered**
4. **Tests added**
5. **Operational impact**
6. **Backward compatibility note**

## Definition of Done
A change is done only if:
- invariants are enforced in code and storage
- failure paths are tested
- CI gates pass
- docs reflect actual behavior
- the feature can be released without manual tribal knowledge