# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-17

### Added
- Monorepo topology with NPM Workspaces (`apps/api`, `apps/web`, `packages/sync-contract`).
- Shared Zod schemas for sync contract enforcement.
- Prisma versioned migrations for backend database discipline.
- Structured Winston logging in backend and telemetry signals in frontend.
- Robust CI/CD pipeline with quality gates (Lint, Typecheck, Test Coverage, Migration check).
- Architecture Decision Records (ADRs) for Monorepo and Contract strategy.
- Automated release draft generation on merge to main.

### Fixed
- Outdated documentation in README and docs/ folder.
- Type-only contract validation replaced with runtime Zod parsing.
- Frontend test runner consistency (switched to Vitest).
- CI native binding issues for Tailwind/LightningCSS.
