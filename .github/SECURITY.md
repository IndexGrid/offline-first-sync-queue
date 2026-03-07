# Security Policy

## Supported scope

This repository is a public demonstration of an offline-first synchronization architecture. Security-relevant areas include, but are not limited to:

- authentication and authorization paths
- idempotency guarantees and replay handling
- queue processing and retry behavior
- request validation and payload boundaries
- data exposure through logs, dashboards, or debug output
- secret handling in environment files, examples, workflows, or documentation

## Supported versions

Because this project is evolving, only the **latest state of the `main` branch** is considered supported for security review.

Older commits, forks, and modified downstream deployments may not receive fixes.

## Reporting a vulnerability

Do **not** open a public issue.

Use one of these private channels:

1. **GitHub private vulnerability reporting / security advisory**, if enabled for the repository.
2. If that option is unavailable, contact the maintainer privately through GitHub.

## What to include in a report

Please include:

- vulnerability type
- affected component or file path
- prerequisites and impact
- reproduction steps or proof of concept
- expected behavior vs actual behavior
- whether the issue can expose data, bypass auth, duplicate writes, or corrupt sync state
- any suggested mitigation

## Response targets

Best-effort targets:

- initial acknowledgment: within **7 days**
- status update after triage: within **14 days** when the report is valid and reproducible

These are targets, not guarantees.

## Disclosure policy

Please give the maintainer reasonable time to investigate and patch before public disclosure.

If the report is valid, the goal is to:

- reproduce the issue
- assess impact
- prepare a fix or mitigation
- publish an advisory or changelog note when appropriate

## Out of scope

The following are usually out of scope unless they create a real exploit path in this repository itself:

- best-practice disagreements without practical impact
- theoretical attacks without a reproducible path
- vulnerabilities only present in third-party services not controlled by this repository
- issues caused solely by insecure downstream deployment choices
