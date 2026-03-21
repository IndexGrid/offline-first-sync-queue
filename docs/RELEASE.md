## Release & Change Control

### Change entries (required on PRs)

For any change that touches `apps/`, `packages/`, `infra/` or `tools/` (excluding docs-only changes), add exactly one file under:

- `changes/unreleased/*.md`

Use this template: `changes/TEMPLATE.md`.

Minimum required fields inside the change entry:
- `Type: patch|minor|major`
- `Scope: api|web|sync-contract|infra|docs|repo`
- `Breaking: yes|no`
- `Migration:` (must not be `none` when breaking or when a migration changes)
- `Rollback:` (must not be `none` when breaking or when a migration changes)
- `Compatibility:` (required; must be explicit when breaking)

CI enforces this via `npm run changes:check`.

### Migration / rollback / compatibility rules

If a PR touches `apps/api/prisma/migrations/**`:
- `Migration:` must describe the forward application steps and any required downtime/ordering
- `Rollback:` must describe how to revert or mitigate
- `Compatibility:` must state forward/backward compatibility expectations

If `Breaking: yes`:
- All three sections above are mandatory and must not be `none`

### Cutting a release

1. Ensure `changes/unreleased/` is empty OR ready to be released.
2. Run:
   - `npm run changes:release -- <X.Y.Z>`
3. Commit the updated `CHANGELOG.md` and moved change entry files.
4. Bump root `package.json` version to `X.Y.Z`.
5. Tag and push:
   - `git tag vX.Y.Z`
   - `git push --tags`

CI blocks tag releases unless:
- tag matches root `package.json` version
- `CHANGELOG.md` contains `## [X.Y.Z]`
- `changes/unreleased/` is empty

