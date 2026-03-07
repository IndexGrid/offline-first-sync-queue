# Contributing

Thanks for contributing to **offline-first-sync-queue**.

This repository demonstrates an offline-first synchronization architecture using **Next.js, TypeScript, IndexedDB, NestJS, and PostgreSQL**. Contributions are welcome, but they must preserve the project's core guarantees:

- idempotent writes via `externalId`
- resilient retry and backoff behavior
- endpoint-aware batching
- payload-size safety
- dead-letter handling
- predictable local queue state transitions

## Before opening an issue

Use the issue templates.

Open an issue first when your change is large, architectural, or behavior-changing. Small fixes such as typos, docs clarifications, or isolated test improvements can go straight to a pull request.

## What to contribute

Good contribution targets:

- bug fixes
- tests for queue/sync edge cases
- documentation improvements
- observability improvements
- reliability improvements for offline/retry flows
- performance improvements with measurable evidence
- developer experience improvements that do not dilute core behavior

Low-value contributions:

- purely stylistic churn
- unrelated dependency churn
- speculative abstractions with no demonstrated need
- changes that weaken idempotency, traceability, or reproducibility

## Development expectations

1. Fork the repository and create a focused branch.
2. Keep changes small and scoped.
3. Add or update documentation when behavior changes.
4. Add or update tests when logic changes.
5. Keep commits readable and reviewable.

Recommended branch naming:

- `fix/...`
- `feat/...`
- `docs/...`
- `refactor/...`
- `test/...`

## Local setup

Follow the repository README for the main setup flow.

Typical local workflow:

```bash
# frontend (from repository root)
cp frontend/.env.example frontend/.env.local
cd frontend
npm install
npm run dev

# backend (from repository root, in another terminal)
cd frontend/backend
cp .env.example .env
npm install
npm run start:dev
```

If your local folder layout differs from the README, follow the README as the source of truth and mention any discrepancy in your PR.

## Pull request rules

Every pull request should:

- explain **what** changed and **why**
- describe user-visible or behavior-visible impact
- mention trade-offs and risks
- include test evidence or explain why tests were not added
- stay limited to one concern whenever possible

### For reliability-related changes

If you touch queueing, retries, batching, deduplication, locking, or sync semantics, include:

- failure scenario addressed
- previous behavior
- new behavior
- proof that idempotency was preserved
- proof that state transitions remain coherent

### For API contract changes

If you change request/response behavior, update:

- README
- examples
- issue/PR context as needed
- any affected docs in the repository

## Commit guidance

Conventional Commits are preferred, for example:

- `feat: add per-endpoint batch grouping`
- `fix: prevent duplicate enqueue on repeated clicks`
- `docs: clarify backend folder structure`

## Testing guidance

Before opening a PR, run the relevant checks that exist for the affected package(s), such as:

```bash
npm run test
npm run lint
npm run build
```

If a script does not exist, say so in the pull request.

For sync-related changes, test at least one of these scenarios when applicable:

- offline creation then reconnect
- repeated retry after transient failure
- invalid payload handling
- duplicate `externalId` handling
- partial batch success
- payload split/chunk boundary behavior
- stuck `IN_FLIGHT` recovery

## Security

Do **not** open public issues for vulnerabilities, secret leaks, auth flaws, or exploitable sync behavior. Use [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the repository's existing license.
