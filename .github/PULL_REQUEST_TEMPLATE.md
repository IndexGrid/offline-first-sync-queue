## Summary

Describe the change in 2-5 sentences.

## Why this change exists

Explain the problem, gap, or failure mode being addressed.

## Type of change

- [ ] Bug fix
- [ ] Feature
- [ ] Refactor
- [ ] Documentation
- [ ] Test improvement
- [ ] CI / workflow
- [ ] Security-related hardening

## Affected areas

- [ ] Frontend UI
- [ ] IndexedDB / local queue
- [ ] Sync runner / retry
- [ ] Backend API
- [ ] PostgreSQL / persistence
- [ ] Documentation
- [ ] CI / workflow

## Behavior impact

What changes for users, contributors, or maintainers?

## Reliability checklist

Complete this section if the PR touches queueing, retries, batching, deduplication, or API sync behavior.

- [ ] Idempotency semantics were preserved.
- [ ] Duplicate write risk was considered.
- [ ] Retry / backoff behavior was considered.
- [ ] Partial batch success/failure behavior was considered.
- [ ] Recovery from stuck `IN_FLIGHT` items was considered.
- [ ] Payload size / chunk splitting impact was considered.

## Testing

What did you run?

- [ ] Tests
- [ ] Lint
- [ ] Build
- [ ] Manual validation

List commands and outcomes:

```bash
# paste commands here
```

## Screenshots / logs / traces

Add relevant evidence when useful.

## Documentation

- [ ] README updated
- [ ] Other docs updated
- [ ] No docs update needed

## Breaking changes

- [ ] No breaking changes
- [ ] Breaking changes described below

If breaking, explain migration or compatibility impact.

## Linked issue

Closes #
