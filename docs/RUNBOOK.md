# Operational Runbook - Offline-First POS

## 🛠️ Infrastructure Operations

### Start All Services (Production-like)
```bash
docker-compose -f infra/docker-compose.yml up -d
```

### Database Maintenance
- **Check Migration Status**: `npx prisma migrate status -w apps/api`
- **Deploy New Migrations**: `npx prisma migrate deploy -w apps/api`
- **Reset DB (Dev only)**: `npx prisma migrate reset -w apps/api`

## 📊 Monitoring & Observability

### Health Checks
- **API**: `GET http://localhost:3001/` (Should return 200 OK)
- **Sync Status**: `GET http://localhost:3001/v1/pos/sync` (Not allowed, but verifies endpoint exists)

### Logs
- **Backend Logs**: `docker logs -f infra_api_1`
- **Frontend Sync Metrics**: Open Browser DevTools -> Application -> IndexedDB -> `pos-db` -> `syncQueue`. Check items with status `PENDING` or `ERROR`.

## 🔄 Troubleshooting

### Stuck Sync Queue
If items are stuck in `IN_FLIGHT` for more than 1 minute:
1. Refresh the web app. The runner will automatically requeue stale items.
2. Verify API connectivity: `ping localhost:3001`.

### Database Connection Failure
If the API fails to start with `P1001`:
1. Check if PostgreSQL container is running: `docker ps`.
2. Ensure `DATABASE_URL` in `apps/api/.env` matches the `docker-compose.yml` service name.

### Invalid Contracts
If the API returns `400 Bad Request` during sync:
1. Verify the shared contract version: `npm run build -w packages/sync-contract`.
2. Check `apps/api` logs for specific Zod validation errors.

## 🚀 Deployment Checklist
1. [ ] Build shared contract.
2. [ ] Run all tests (`npm run test`).
3. [ ] Run typecheck (`npm run typecheck`).
4. [ ] Tag the commit and push to main.
5. [ ] CI/CD pipeline will automatically create a release draft.
