# Offline‑First Sync Queue (Next.js + IndexedDB → NestJS/Node.js) — Guia de Execução

Este guia implementa um mecanismo **offline‑first** com **fila local** (IndexedDB) + **batch sync** para um backend **NestJS** com **idempotência** (via `externalId`) e **robustez** (retry/backoff, locking, resultados por item).

## Regra do documento (anti-duplicação)
- **Não existe nenhum bloco de código fora da seção “Implementação canônica”.**
- A seção **Implementação canônica** é a **única fonte de código executável** deste doc.
- Cada arquivo aparece **uma única vez** com código completo.

---

## 0) Visão do fluxo (o que você está construindo)

1. **Write‑ahead local**: ao criar uma entidade (ex.: `Order`) o app salva no IndexedDB:
   - o **estado local** (`orders`)
   - um **evento de sync** (`syncQueue`) com payload mínimo

2. **Sync runner**: quando online, o app coleta itens `PENDING` e envia **em batch** para o backend.

3. **Backend idempotente**: o NestJS processa cada item e responde **por item**:
   - `created | updated | duplicate | invalid | auth_required | error`

4. **Retry com backoff + jitter**: erros transitórios (rede/5xx/429) reprogramam `nextAttemptAt`.

---

## 0.1 Arquivos finais

**Front-end (Next.js)**
- `src/lib/db.ts`
- `src/lib/sync/enqueue.ts`
- `src/lib/sync/retry.ts`
- `src/lib/sync/lock.ts`
- `src/lib/sync/runner.ts`
- `src/components/SyncRunnerBootstrap.tsx`

**Back-end (NestJS)**
- `src/pos-sync/pos-sync.dto.ts`
- `src/pos-sync/orders.repo.ts`
- `src/pos-sync/pos-sync.service.ts`
- `src/pos-sync/pos-sync.controller.ts`
- `src/pos-sync/pos-sync.module.ts`

---

## 1) Contrato (padronizado em `status`)

### 1.1 `externalId` — obrigatório (idempotência)
- Gerado **no cliente** (UUID v4).
- No servidor, `externalId` deve ter **UNIQUE constraint**.

### 1.2 Cliente: estados mínimos
**Orders**
- `externalId: string`
- `data: unknown`
- `syncStatus: 'LOCAL_ONLY' | 'SYNCED' | 'ERROR'`
- `updatedAt: number`

**SyncQueue**
- `status: 'PENDING' | 'IN_FLIGHT' | 'ACKED' | 'DEAD'`
- `retryCount: number`
- `nextAttemptAt: number`
- `inFlightAt?: number` (para destravar `IN_FLIGHT` após crash/refresh)
- `lastError?: string`

### 1.3 Backend: resposta por item
- A resposta sempre é `{ results: [...] }`.
- Cada resultado tem **`externalId` + `status`** (e `reason?` quando aplicável).
- Valores de `status` (único contrato usado no repo/service/controller/response):
  - `created | updated | duplicate | invalid | auth_required | error`

---

## 2) Implementação canônica (única fonte de código)

### 2.1 Front-end — dependências
```bash
npm i idb uuid
```

### 2.2 Front-end — `src/lib/db.ts`
```ts
import { openDB, DBSchema } from 'idb';

export type SyncStatus = 'PENDING' | 'IN_FLIGHT' | 'ACKED' | 'DEAD';
export type OrderSyncState = 'LOCAL_ONLY' | 'SYNCED' | 'ERROR';

export interface OrderRecord {
  externalId: string;
  data: unknown;
  syncStatus: OrderSyncState;
  updatedAt: number;
}

export interface DedupeRecord {
  key: string; // ex.: "order:<hash>"
  externalId: string;
  expiresAt: number;
}

export interface SyncQueueItem {
  id: string;

  /**
   * Em sistemas reais, cada entidade costuma ter endpoint próprio:
   * - orders / inventory / payments
   *
   * O runner agrupa por `url` antes de enviar.
   */
  entityType: 'order' | 'inventory' | 'payment';

  externalId: string;
  op: 'UPSERT';
  url: string; // pode ser relativa (com rewrite) ou absoluta (http://...)
  method: 'POST';
  body: unknown;

  status: SyncStatus;
  retryCount: number;
  nextAttemptAt: number;

  /**
   * Marca quando o item entrou em IN_FLIGHT.
   * Usado para "destravar" caso o app feche/crashe no meio do envio.
   */
  inFlightAt?: number;

  lastError?: string;
  createdAt: number;
}

interface AppDB extends DBSchema {
  orders: {
    key: string; // externalId
    value: OrderRecord;
    indexes: { 'by-syncStatus': OrderSyncState };
  };
  syncQueue: {
    key: string; // id
    value: SyncQueueItem;
    indexes: { 'by-status': SyncStatus; 'by-nextAttemptAt': number };
  };
  locks: {
    key: string;
    value: { key: string; lockedUntil: number };
  };
  dedupe: {
    key: string; // DedupeRecord.key
    value: DedupeRecord;
  };
}

export async function getDB() {
  return openDB<AppDB>('offline-pos', 2, {
    upgrade(db, _oldVersion, _newVersion, tx) {
      if (!db.objectStoreNames.contains('orders')) {
        const orders = db.createObjectStore('orders', { keyPath: 'externalId' });
        orders.createIndex('by-syncStatus', 'syncStatus');
      }

      if (!db.objectStoreNames.contains('syncQueue')) {
        const queue = db.createObjectStore('syncQueue', { keyPath: 'id' });
        queue.createIndex('by-status', 'status');
        queue.createIndex('by-nextAttemptAt', 'nextAttemptAt');
      }

      if (!db.objectStoreNames.contains('locks')) {
        db.createObjectStore('locks', { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains('dedupe')) {
        db.createObjectStore('dedupe', { keyPath: 'key' });
      }

      // Em upgrades, garanta que índices existam (idempotente).
      // (Só roda quando o store já existia; então usamos o `tx` do upgrade.)
      if (db.objectStoreNames.contains('syncQueue')) {
        const queue = tx.objectStore('syncQueue');
        if (!queue.indexNames.contains('by-status')) queue.createIndex('by-status', 'status');
        if (!queue.indexNames.contains('by-nextAttemptAt')) queue.createIndex('by-nextAttemptAt', 'nextAttemptAt');
      }
      if (db.objectStoreNames.contains('orders')) {
        const orders = tx.objectStore('orders');
        if (!orders.indexNames.contains('by-syncStatus')) orders.createIndex('by-syncStatus', 'syncStatus');
      }
    },
  });
}
```

### 2.3 Front-end — `src/lib/sync/enqueue.ts`
```ts
import { v4 as uuidv4 } from 'uuid';
import { getDB, DedupeRecord, OrderRecord, SyncQueueItem } from '../db';

function stableStringify(value: any): string {
  if (value === undefined) return '"__undefined__"';
  if (value === null) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value) ?? 'null';

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  const props = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`);
  return `{${props.join(',')}}`;
}

// FNV-1a (rápido, suficiente para dedupe local; NÃO é hash criptográfico)
function hashFNV1a(str: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export async function enqueueOrder(
  orderData: unknown,
  opts?: {
    /**
     * Janela para dedupe local (double click / double submit).
     * Se um pedido idêntico for enfileirado dentro dessa janela, retornamos o externalId anterior.
     */
    dedupeWindowMs?: number;
  },
) {
  const db = await getDB();
  const now = Date.now();
  const dedupeWindowMs = opts?.dedupeWindowMs ?? 2_000;

  // Dedupe: evita duplicar eventos quando o usuário clica 2x (melhoria opcional, mas útil em POS)
  const dedupeKey = `order:${hashFNV1a(stableStringify(orderData))}`;

  const tx = db.transaction(['dedupe', 'orders', 'syncQueue'], 'readwrite');
  const dedupeStore = tx.objectStore('dedupe');

  const existing = (await dedupeStore.get(dedupeKey)) as DedupeRecord | undefined;
  if (existing && existing.expiresAt > now) {
    const order = await tx.objectStore('orders').get(existing.externalId);
    if (order) {
      await tx.done;
      return { externalId: existing.externalId };
    }
  }

  const externalId = uuidv4();

  const order: OrderRecord = {
    externalId,
    data: orderData,
    syncStatus: 'LOCAL_ONLY',
    updatedAt: now,
  };

  const item: SyncQueueItem = {
    id: uuidv4(),
    entityType: 'order',
    externalId,
    op: 'UPSERT',
    url: '/admin/pos/sync',
    method: 'POST',
    body: { externalId, data: orderData },
    status: 'PENDING',
    retryCount: 0,
    nextAttemptAt: now,
    createdAt: now,
  };

  // Transação: estado + evento + marca dedupe
  await tx.objectStore('orders').put(order);
  await tx.objectStore('syncQueue').put(item);

  await dedupeStore.put({
    key: dedupeKey,
    externalId,
    expiresAt: now + dedupeWindowMs,
  } satisfies DedupeRecord);

  await tx.done;

  return { externalId };
}
```

### 2.4 Front-end — `src/lib/sync/retry.ts`
```ts
export function computeNextAttemptAt(retryCount: number) {
  const base = 1_000; // 1s
  const cap = 60_000; // 60s
  const exp = Math.min(cap, base * 2 ** retryCount);

  // Full jitter: distribui bem a carga após reconexão/spike
  const jitter = Math.random() * exp;
  return Date.now() + jitter;
}

export function shouldRetry(status?: number) {
  // Rede: status undefined => retry
  if (status === undefined) return true;

  // Timeout
  if (status === 408) return true;

  // Payload/credencial: não é retry automático (precisa ação)
  if (status === 400 || status === 401 || status === 403 || status === 413) return false;

  // Rate limit / server errors
  if (status === 429) return true;
  if (status >= 500) return true;

  return false;
}
```

### 2.5 Front-end — `src/lib/sync/lock.ts`
```ts
import { getDB } from '../db';

/**
 * Lock simples em IndexedDB para evitar rodar o runner em paralelo.
 * Retorna `null` quando o lock já está ocupado.
 *
 * Observação: o lock é "best effort" (single-tab). Para multi-tab, prefira:
 * - BroadcastChannel + leader election, ou
 * - Web Locks API (quando disponível), ou
 * - um lock com "ownerId" (tabId) + heartbeats.
 */
export async function withDbLock<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  const db = await getDB();
  const now = Date.now();

  const tx = db.transaction('locks', 'readwrite');
  const store = tx.objectStore('locks');

  const existing = await store.get(key);
  if (existing && existing.lockedUntil > now) {
    await tx.done;
    return null;
  }

  await store.put({ key, lockedUntil: now + ttlMs });
  await tx.done;

  try {
    return await fn();
  } finally {
    // libera (best effort)
    const tx2 = db.transaction('locks', 'readwrite');
    await tx2.objectStore('locks').put({ key, lockedUntil: 0 });
    await tx2.done;
  }
}
```

**Alternativas (sem duplicar código):**
- Opção A: lock simples via IndexedDB (este guia) — suficiente para **single‑tab**.
- Opção B: multi‑tab: Web Locks API (quando disponível) ou leader election via `BroadcastChannel` (um “líder” roda o runner).

### 2.6 Front-end — `src/lib/sync/runner.ts`
```ts
import { getDB, SyncQueueItem } from '../db';
import { computeNextAttemptAt, shouldRetry } from './retry';
import { withDbLock } from './lock';

type SyncItemResult =
  | { externalId: string; status: 'created' | 'updated' | 'duplicate' }
  | { externalId: string; status: 'invalid'; reason?: string }
  | { externalId: string; status: 'auth_required' }
  | { externalId: string; status: 'error'; reason?: string };

type SyncResponse = { results: SyncItemResult[] };

type CompressionMode = 'none' | 'gzip';

function toClientErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message.slice(0, 300);
  return 'unknown_error';
}

/**
 * Resolve URL:
 * - Se `url` já for absoluta (http/https), use direto
 * - Se for relativa, escolha **uma**:
 *   - Opção A: configurar um rewrite/proxy no Next.js (mesma origem)
 *   - Opção B: definir NEXT_PUBLIC_API_BASE_URL (ex.: http://localhost:3001)
 */
function resolveUrl(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;

  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) return pathOrUrl; // assume mesma origem (rewrite)
  return new URL(pathOrUrl, base).toString();
}

function groupBy<T>(items: T[], key: (t: T) => string) {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

function jsonByteLength(json: string) {
  try {
    return new TextEncoder().encode(json).length;
  } catch {
    // fallback: aproximação (1 char ~= 1 byte em ASCII; pior caso em UTF-16)
    return json.length;
  }
}

async function encodeRequestBody(json: string, compression: CompressionMode) {
  if (compression === 'none') return { body: json as BodyInit, headers: {} as Record<string, string> };

  // Sem suporte no browser => fallback "none"
  if (typeof CompressionStream === 'undefined') {
    return { body: json as BodyInit, headers: {} as Record<string, string> };
  }

  // gzip (POS offline costuma ganhar muito)
  const cs = new CompressionStream('gzip');
  const blob = new Blob([json], { type: 'application/json' });
  const compressedStream = blob.stream().pipeThrough(cs);
  const ab = await new Response(compressedStream).arrayBuffer();

  return {
    body: new Uint8Array(ab) as BodyInit,
    headers: { 'Content-Encoding': 'gzip' } as Record<string, string>,
  };
}

function payloadKeyForEntity(entityType: SyncQueueItem['entityType']) {
  // Convenção simples. Em produção, cada endpoint geralmente tem DTO próprio.
  switch (entityType) {
    case 'order':
      return 'orders';
    case 'payment':
      return 'payments';
    case 'inventory':
      return 'inventory';
  }
}

function buildEnvelope(
  entityType: SyncQueueItem['entityType'],
  deviceId: string,
  items: SyncQueueItem[],
) {
  const key = payloadKeyForEntity(entityType);
  return {
    deviceId,
    [key]: items.map((x) => x.body),
  } as Record<string, unknown>;
}

function chunkByMaxPayloadSize(opts: {
  entityType: SyncQueueItem['entityType'];
  deviceId: string;
  items: SyncQueueItem[];
  maxBytes: number;
}) {
  const { entityType, deviceId, items, maxBytes } = opts;
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) return [items];

  const chunks: SyncQueueItem[][] = [];
  let cur: SyncQueueItem[] = [];

  for (const item of items) {
    if (cur.length === 0) {
      cur = [item];
      continue;
    }

    const test = [...cur, item];
    const size = jsonByteLength(JSON.stringify(buildEnvelope(entityType, deviceId, test)));
    if (size <= maxBytes) {
      cur = test;
    } else {
      chunks.push(cur);
      cur = [item];
    }
  }

  if (cur.length) chunks.push(cur);
  return chunks;
}

async function requeueStaleInFlight(db: Awaited<ReturnType<typeof getDB>>, staleAfterMs: number) {
  const now = Date.now();
  const tx = db.transaction('syncQueue', 'readwrite');
  const store = tx.objectStore('syncQueue');
  const byStatus = store.index('by-status');

  let cursor = await byStatus.openCursor('IN_FLIGHT');
  while (cursor) {
    const item = cursor.value as SyncQueueItem;
    const inFlightAt = item.inFlightAt ?? 0;

    if (inFlightAt > 0 && inFlightAt + staleAfterMs < now) {
      await cursor.update({
        ...item,
        status: 'PENDING',
        nextAttemptAt: now,
        inFlightAt: undefined,
        lastError: 'stale_in_flight',
      });
    }

    cursor = await cursor.continue();
  }

  await tx.done;
}

export async function runSyncOnce(opts: {
  batchSize: number;
  fetchImpl?: typeof fetch;
  authToken?: string;
  deviceId?: string;
  maxRetries?: number;
  staleInFlightAfterMs?: number;

  /**
   * Limite de payload (em bytes) por request.
   * Protege contra batch gigante e payloads enormes.
   */
  maxBatchPayloadSize?: number;

  /**
   * Compressão de request (melhora muito em POS offline).
   * Requer backend aceitar `Content-Encoding: gzip`.
   *
   * Observação: brotli ("br") pode ser ainda melhor, mas nem todo ambiente suporta.
   */
  compression?: CompressionMode;
}) {
  const {
    batchSize,
    fetchImpl = fetch,
    authToken,
    deviceId = 'pos-001',
    maxRetries = 10,
    staleInFlightAfterMs = 60_000,
    maxBatchPayloadSize = 256 * 1024,
    compression = 'none',
  } = opts;

  // lock por ~8s evita corrida em onLine + timer + userClick
  const locked = await withDbLock('sync-runner', 8_000, async () => {
    const db = await getDB();
    const now = Date.now();

    // Evita itens travados em IN_FLIGHT após crash/refresh
    await requeueStaleInFlight(db, staleInFlightAfterMs);

    // Buscar pendentes cujo nextAttemptAt <= now
    const pending: SyncQueueItem[] = [];
    const tx = db.transaction('syncQueue', 'readonly');
    const index = tx.objectStore('syncQueue').index('by-nextAttemptAt');

    // Otimização: limitar cursor a nextAttemptAt <= now (evita varrer o índice inteiro quando a fila cresce)
    const range = IDBKeyRange.upperBound(now);
    let cursor = await index.openCursor(range);
    while (cursor && pending.length < batchSize) {
      const item = cursor.value as SyncQueueItem;
      if (item.status === 'PENDING' && item.nextAttemptAt <= now) pending.push(item);
      cursor = await cursor.continue();
    }
    await tx.done;

    if (pending.length === 0) return { sent: 0, acked: 0, dead: 0 };

    /**
     * Correção importante: NÃO assuma que o batch inteiro usa o mesmo endpoint.
     * Em sistemas reais, "orders", "inventory" e "payments" quase sempre têm URLs diferentes.
     *
     * Portanto: primeiro agrupamos por `item.url`, e enviamos um request por grupo (ou mais, se bater no limite de payload).
     */
    const byUrl = groupBy(pending, (x) => x.url);

    let sent = 0;
    let acked = 0;
    let dead = 0;

    for (const [url, urlItems] of byUrl.entries()) {
      const endpoint = resolveUrl(url);

      // (Opcional) se houver métodos diferentes no mesmo endpoint, separe.
      const byMethod = groupBy(urlItems, (x) => x.method);

      for (const [method, methodItems] of byMethod.entries()) {
        // Em geral, cada endpoint é específico de uma entidade, mas não vamos assumir.
        const byEntity = groupBy(methodItems, (x) => x.entityType);

        for (const [entityTypeStr, entityItems] of byEntity.entries()) {
          const entityType = entityTypeStr as SyncQueueItem['entityType'];

          // Proteção: limite de payload por request (bytes)
          const chunks = chunkByMaxPayloadSize({
            entityType,
            deviceId,
            items: entityItems,
            maxBytes: maxBatchPayloadSize,
          });

          for (const chunk of chunks) {
            // Se um único item estoura o limite local, mate o item (não adianta tentar)
            const envelopeJson = JSON.stringify(buildEnvelope(entityType, deviceId, chunk));
            const size = jsonByteLength(envelopeJson);
            if (chunk.length === 1 && size > maxBatchPayloadSize) {
              await markDeadLocalTooLarge(db, chunk[0], size, maxBatchPayloadSize);
              sent += 1;
              dead += 1;
              continue;
            }

            const r = await sendOneBatch({
              db,
              fetchImpl,
              endpoint,
              method,
              authToken,
              deviceId,
              entityType,
              items: chunk,
              envelopeJson,
              compression,
              maxRetries,
            });

            sent += r.sent;
            acked += r.acked;
            dead += r.dead;
          }
        }
      }
    }

    return { sent, acked, dead };
  });

  if (locked === null) return { sent: 0, acked: 0, dead: 0, skipped: true };
  return locked;
}

async function sendOneBatch(opts: {
  db: Awaited<ReturnType<typeof getDB>>;
  fetchImpl: typeof fetch;
  endpoint: string;
  method: string;
  authToken?: string;
  deviceId: string;
  entityType: SyncQueueItem['entityType'];
  items: SyncQueueItem[];
  envelopeJson: string;
  compression: CompressionMode;
  maxRetries: number;
}) {
  const {
    db,
    fetchImpl,
    endpoint,
    method,
    authToken,
    entityType,
    items,
    envelopeJson,
    compression,
    maxRetries,
  } = opts;

  // Marcar como IN_FLIGHT (com timestamp, para "destravar" depois)
  const now = Date.now();
  const tx2 = db.transaction('syncQueue', 'readwrite');
  for (const item of items) {
    await tx2.objectStore('syncQueue').put({ ...item, status: 'IN_FLIGHT', inFlightAt: now });
  }
  await tx2.done;

  try {
    const encoded = await encodeRequestBody(envelopeJson, compression);

    const res = await fetchImpl(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(encoded.headers ?? {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: encoded.body,
    });

    // Falha no nível batch (não recebemos results por item)
    if (!res.ok) {
      // Auth: não é "erro do item" — é reauth/credencial
      if (res.status === 401 || res.status === 403) {
        await markAuthRequired(db, items, `http_${res.status}`);
        return { sent: items.length, acked: 0, dead: 0 };
      }

      // 4xx (exceto 429) geralmente é request inválida → não retry automático
      const retry = shouldRetry(res.status);
      await applyBatchFailure(db, items, retry, `http_${res.status}`, maxRetries);
      return { sent: items.length, acked: 0, dead: retry ? 0 : items.length };
    }

    const json = (await res.json()) as SyncResponse;
    const resultById = new Map(json.results.map((r) => [r.externalId, r]));

    let acked = 0;
    let dead = 0;

    // Aplicar resultados item-a-item
    const tx3 = db.transaction(['syncQueue', 'orders'], 'readwrite');
    const q = tx3.objectStore('syncQueue');
    const o = tx3.objectStore('orders');

    for (const item of items) {
      const r = resultById.get(item.externalId);

      if (!r) {
        // Sem resposta -> tratar como retry (até maxRetries)
        const nextRetry = item.retryCount + 1;
        if (nextRetry > maxRetries) {
          await q.put({
            ...item,
            status: 'DEAD',
            nextAttemptAt: Number.MAX_SAFE_INTEGER,
            inFlightAt: undefined,
            lastError: 'missing_result',
          });
          if (entityType === 'order') {
            const order = await o.get(item.externalId);
            if (order) await o.put({ ...order, syncStatus: 'ERROR', updatedAt: Date.now() });
          }
          dead++;
        } else {
          const next = computeNextAttemptAt(nextRetry);
          await q.put({
            ...item,
            status: 'PENDING',
            inFlightAt: undefined,
            retryCount: nextRetry,
            nextAttemptAt: next,
            lastError: 'missing_result',
          });
        }
        continue;
      }

      if (r.status === 'created' || r.status === 'updated' || r.status === 'duplicate') {
        await q.put({
          ...item,
          status: 'ACKED',
          nextAttemptAt: Number.MAX_SAFE_INTEGER,
          inFlightAt: undefined,
          lastError: undefined,
        });
        if (entityType === 'order') {
          const order = await o.get(item.externalId);
          if (order) await o.put({ ...order, syncStatus: 'SYNCED', updatedAt: Date.now() });
        }
        acked++;
        continue;
      }

      if (r.status === 'auth_required') {
        // pausa: não martelar
        await q.put({
          ...item,
          status: 'PENDING',
          inFlightAt: undefined,
          nextAttemptAt: Date.now() + 60_000,
          lastError: 'auth_required',
        });
        if (entityType === 'order') {
          const order = await o.get(item.externalId);
          if (order) await o.put({ ...order, syncStatus: 'ERROR', updatedAt: Date.now() });
        }
        continue;
      }

      if (r.status === 'invalid') {
        await q.put({
          ...item,
          status: 'DEAD',
          nextAttemptAt: Number.MAX_SAFE_INTEGER,
          inFlightAt: undefined,
          lastError: r.reason ?? 'invalid',
        });
        if (entityType === 'order') {
          const order = await o.get(item.externalId);
          if (order) await o.put({ ...order, syncStatus: 'ERROR', updatedAt: Date.now() });
        }
        dead++;
        continue;
      }

      // r.status === 'error' => retry (até maxRetries)
      const nextRetry = item.retryCount + 1;
      if (nextRetry > maxRetries) {
        await q.put({
          ...item,
          status: 'DEAD',
          nextAttemptAt: Number.MAX_SAFE_INTEGER,
          inFlightAt: undefined,
          lastError: r.reason ?? 'error',
        });
        if (entityType === 'order') {
          const order = await o.get(item.externalId);
          if (order) await o.put({ ...order, syncStatus: 'ERROR', updatedAt: Date.now() });
        }
        dead++;
      } else {
        const next = computeNextAttemptAt(nextRetry);
        await q.put({
          ...item,
          status: 'PENDING',
          inFlightAt: undefined,
          retryCount: nextRetry,
          nextAttemptAt: next,
          lastError: r.reason ?? 'error',
        });
      }
    }

    await tx3.done;
    return { sent: items.length, acked, dead };
  } catch (err) {
    // Erro de rede/parse -> retry geral
    await applyBatchFailure(db, items, true, toClientErrorMessage(err), maxRetries);
    return { sent: items.length, acked: 0, dead: 0 };
  }
}

async function markDeadLocalTooLarge(
  db: Awaited<ReturnType<typeof getDB>>,
  item: SyncQueueItem,
  computedBytes: number,
  maxBytes: number,
) {
  const tx = db.transaction(['syncQueue', 'orders'], 'readwrite');
  const q = tx.objectStore('syncQueue');
  const o = tx.objectStore('orders');

  await q.put({
    ...item,
    status: 'DEAD',
    nextAttemptAt: Number.MAX_SAFE_INTEGER,
    inFlightAt: undefined,
    lastError: `payload_too_large_local:${computedBytes}>${maxBytes}`,
  });

  if (item.entityType === 'order') {
    const order = await o.get(item.externalId);
    if (order) await o.put({ ...order, syncStatus: 'ERROR', updatedAt: Date.now() });
  }

  await tx.done;
}

async function markAuthRequired(
  db: Awaited<ReturnType<typeof getDB>>,
  items: SyncQueueItem[],
  reason: string,
) {
  const tx = db.transaction(['syncQueue', 'orders'], 'readwrite');
  const q = tx.objectStore('syncQueue');
  const o = tx.objectStore('orders');

  for (const item of items) {
    await q.put({
      ...item,
      status: 'PENDING',
      inFlightAt: undefined,
      nextAttemptAt: Date.now() + 60_000,
      lastError: reason,
    });

    if (item.entityType === 'order') {
      const order = await o.get(item.externalId);
      if (order) await o.put({ ...order, syncStatus: 'ERROR', updatedAt: Date.now() });
    }
  }

  await tx.done;
}

async function applyBatchFailure(
  db: Awaited<ReturnType<typeof getDB>>,
  items: SyncQueueItem[],
  retry: boolean,
  reason: string,
  maxRetries: number,
) {
  const tx = db.transaction('syncQueue', 'readwrite');
  const store = tx.objectStore('syncQueue');

  for (const item of items) {
    if (!retry) {
      await store.put({
        ...item,
        status: 'DEAD',
        nextAttemptAt: Number.MAX_SAFE_INTEGER,
        inFlightAt: undefined,
        lastError: reason,
      });
      continue;
    }

    const nextRetry = item.retryCount + 1;
    if (nextRetry > maxRetries) {
      await store.put({
        ...item,
        status: 'DEAD',
        nextAttemptAt: Number.MAX_SAFE_INTEGER,
        inFlightAt: undefined,
        lastError: reason,
      });
      continue;
    }

    const next = computeNextAttemptAt(nextRetry);
    await store.put({
      ...item,
      status: 'PENDING',
      inFlightAt: undefined,
      retryCount: nextRetry,
      nextAttemptAt: next,
      lastError: reason,
    });
  }

  await tx.done;
}
```

### 2.7 Front-end — `src/components/SyncRunnerBootstrap.tsx`
```ts
'use client';

import { useEffect } from 'react';
import { runSyncOnce } from '@/lib/sync/runner';

function getOrCreateDeviceId() {
  const key = 'posDeviceId';
  const existing = localStorage.getItem(key);
  if (existing) return existing;

  const id =
    (globalThis.crypto?.randomUUID?.() as string | undefined) ??
    `pos-${Math.random().toString(16).slice(2)}`;

  localStorage.setItem(key, id);
  return id;
}

export function SyncRunnerBootstrap() {
  useEffect(() => {
    const deviceId = getOrCreateDeviceId();
    const run = () => runSyncOnce({ batchSize: 50, deviceId }).catch(() => {});

    // ao ficar online
    window.addEventListener('online', run);

    // ao voltar para o app
    const onVis = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVis);

    // timer leve (evite agressivo)
    const id = window.setInterval(run, 15_000);

    // primeira tentativa
    run();

    return () => {
      window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(id);
    };
  }, []);

  return null;
}
```

---

### 2.8 Back-end — dependências (validação)
```bash
npm i class-validator class-transformer
```

### 2.9 Back-end — `src/pos-sync/pos-sync.dto.ts`
```ts
import { IsArray, IsNotEmpty, IsObject, IsString } from 'class-validator';

export type SyncOrderInput = {
  externalId?: string;
  data?: unknown;
};

export class PosSyncRequestDto {
  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  /**
   * Importante: NÃO usamos validação "deep" (ValidateNested) aqui de propósito.
   * Motivo: se 1 item falhar na validação, o Nest rejeita o batch inteiro (400),
   * e você perde o contrato "resultado por item".
   *
   * A validação por item fica no service.
   */
  @IsArray()
  @IsObject({ each: true })
  orders!: SyncOrderInput[];
}

export type PosSyncItemStatus = 'created' | 'updated' | 'duplicate' | 'invalid' | 'auth_required' | 'error';

export type PosSyncResult =
  | { externalId: string; status: 'created' | 'updated' | 'duplicate' }
  | { externalId: string; status: 'invalid'; reason?: string }
  | { externalId: string; status: 'auth_required' }
  | { externalId: string; status: 'error'; reason?: string };

export class PosSyncResponseDto {
  results!: PosSyncResult[];
}
```

### 2.10 Back-end — esquema Postgres (idempotência por UNIQUE)
```sql
CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  external_id UUID NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.11 Back-end — `src/pos-sync/pos-sync.service.ts`
```ts
import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { OrdersRepo } from './orders.repo';
import { PosSyncResult, SyncOrderInput } from './pos-sync.dto';

@Injectable()
export class PosSyncService {
  constructor(private readonly orders: OrdersRepo) {}

  async syncBatch(items: SyncOrderInput[]): Promise<PosSyncResult[]> {
    const results: PosSyncResult[] = [];

    for (const item of items) {
      const externalId = String(item.externalId ?? '');

      // Validação por item (preserva "resultado por item", sem derrubar o batch inteiro)
      if (!externalId) {
        results.push({ externalId, status: 'invalid', reason: 'missing_externalId' });
        continue;
      }
      if (!isUUID(externalId)) {
        results.push({ externalId, status: 'invalid', reason: 'invalid_externalId' });
        continue;
      }
      if (item.data === null || item.data === undefined || typeof item.data !== 'object') {
        results.push({ externalId, status: 'invalid', reason: 'invalid_data' });
        continue;
      }

      try {
        const r = await this.orders.upsertByExternalId(externalId, item.data);
        results.push({ externalId, status: r.status });
      } catch {
        // Produção: diferenciar erro transitório (retry) vs erro permanente (invalid)
        results.push({ externalId, status: 'error', reason: 'db_error' });
      }
    }

    return results;
  }
}
```

### 2.12 Back-end — dependências (Postgres)
```bash
npm i pg
```

### 2.13 Back-end — `src/pos-sync/orders.repo.ts`
```ts
import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class OrdersRepo {
  constructor(private readonly pool: Pool) {}

  async upsertByExternalId(
    externalId: string,
    payload: any,
  ): Promise<{ status: 'created' | 'updated' | 'duplicate' }> {
    /**
     * Estratégia:
     * - INSERT: created
     * - CONFLICT + payload diferente: updated
     * - CONFLICT + payload igual: duplicate (nenhuma escrita)
     *
     * Observação: `WHERE ... IS DISTINCT FROM ...` evita update "à toa" quando for reenvio idêntico.
     */
    const q = `
      INSERT INTO orders (external_id, payload)
      VALUES ($1::uuid, $2::jsonb)
      ON CONFLICT (external_id) DO UPDATE
        SET payload = EXCLUDED.payload,
            updated_at = now()
        WHERE orders.payload IS DISTINCT FROM EXCLUDED.payload
      RETURNING (xmax = 0) AS inserted;
    `;

    const res = await this.pool.query(q, [externalId, JSON.stringify(payload)]);

    // 0 rows => conflito sem update (payload igual) => duplicate
    if (!res.rows?.length) return { status: 'duplicate' };

    const inserted = Boolean(res.rows[0].inserted);
    return { status: inserted ? 'created' : 'updated' };
  }
}
```

### 2.14 Back-end — `src/pos-sync/pos-sync.module.ts`
```ts
import { Module, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { PosSyncController } from './pos-sync.controller';
import { PosSyncService } from './pos-sync.service';
import { OrdersRepo } from './orders.repo';

@Module({
  controllers: [PosSyncController],
  providers: [
    PosSyncService,
    OrdersRepo,
    {
      provide: Pool,
      useFactory: () => new Pool({ connectionString: process.env.DATABASE_URL }),
    },
  ],
})
export class PosSyncModule implements OnModuleDestroy {
  constructor(private readonly pool: Pool) {}
  async onModuleDestroy() {
    await this.pool.end();
  }
}
```

### 2.15 Back-end — `src/pos-sync/pos-sync.controller.ts`
```ts
import { Body, Controller, Post } from '@nestjs/common';
import { PosSyncRequestDto, PosSyncResponseDto } from './pos-sync.dto';
import { PosSyncService } from './pos-sync.service';

@Controller('/admin/pos')
export class PosSyncController {
  constructor(private readonly svc: PosSyncService) {}

  @Post('/sync')
  async sync(@Body() dto: PosSyncRequestDto): Promise<PosSyncResponseDto> {
    const results = await this.svc.syncBatch(dto.orders);
    return { results };
  }
}
```

---

### 2.16 Demo — `docker-compose.yml`
```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_USER: postgres
      POSTGRES_DB: app
    ports:
      - "5432:5432"

  api:
    build: ./api
    environment:
      DATABASE_URL: postgres://postgres:postgres@postgres:5432/app
    ports:
      - "3001:3001"
    depends_on:
      - postgres
```

---

## 3) Operação e robustez (o que torna isso “produção”)

### 3.1 Anti‑spike na reconexão
- Use **batch** (ex.: 50 por request).
- **Agrupe por endpoint** (`groupBy(item.url)`) e envie requests separados.
- Use **jitter** no backoff.
- Use **lock** no runner.
- Limite o tamanho do request com **`maxBatchPayloadSize`** (bytes).
- (Opcional) ative **compressão gzip** do request para reduzir tráfego offline (requer backend suportar `Content-Encoding`).
- Evite timer agressivo; prefira gatilhos `online` + `visibilitychange` + intervalo leve.

### 3.2 Dead-letter
Após `maxRetries` (ex.: 10), marque `DEAD`:
- Exiba no UI: “Itens com falha — abrir/reenviar”.
- Permita “requeue” manual.

### 3.3 Observabilidade mínima (recomendado)
No backend:
- `pos_sync_requests_total`
- `pos_sync_items_total{status="created|updated|duplicate|invalid|error"}`
- `pos_sync_latency_seconds`

No front:
- contador de `PENDING/IN_FLIGHT/DEAD`
- último erro

---

## 4) Segurança / Autenticação (JWT) — decisão prática
- Opção A: JWT normal (`Authorization: Bearer ...`)
- Opção B: device token (mais simples para demo)

Se `401/403`, o cliente deve **pausar** e pedir reauth (sem retry agressivo). O runner já trata isso (reprograma e marca erro).

---

## 5) Checklist de entrega (para você não se sabotar)

### Funcional
- Criar pedido offline → aparece local
- Double click / double submit → dedupe local evita enfileirar evento redundante
- Reconectar → batch sync roda e marca `SYNCED`
- Reenviar → servidor responde `duplicate` e nada duplica
- Fila grande → runner divide por endpoint e respeita `maxBatchPayloadSize`
- Erro 500 → retry com backoff
- Erro 400/invalid por item → `DEAD` e UI mostra falha

### Qualidade
- README com: problema, garantias, riscos, demo, contrato, limitações
- Testes mínimos:
  - `enqueueOrder()` cria order + queue item (transação)
  - `computeNextAttemptAt()` aumenta com retryCount
  - Backend: `externalId` UNIQUE + upsert não duplica

---

## 6) Limitações explícitas (escreva no README)
- Sem CRDT/merge: consistência **eventual** apenas
- Conflitos de edição simultânea não resolvidos automaticamente (se aplicável)
- **Dedupe local** é best-effort (janela curta) — não substitui idempotência no servidor
- Requests são limitados por **`maxBatchPayloadSize`**; streaming/chunking avançado fica fora do escopo
- **Compressão gzip** do request é opcional e depende do backend aceitar `Content-Encoding: gzip`
- **Background Sync via Service Worker** não está implementado neste guia (fica como extensão); o fallback é o runner

---

## 7) Resultado esperado (demo)
Um repositório com:
- Next.js UI simples (criar pedido, listar, status)
- IndexedDB com `orders` + `syncQueue`
- Runner com lock + batch + retry/backoff
- NestJS `/admin/pos/sync` idempotente com Postgres
- Docker compose e README que prova robustez
