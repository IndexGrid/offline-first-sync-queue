import { getDB, SyncQueueItem } from '../db';
import { computeNextAttemptAt, shouldRetry } from './retry';
import { withDbLock } from './lock';
import { SyncBatchResponse, SyncBatchRequest } from '@offline-pos/sync-contract';

type SyncResponse = SyncBatchResponse;

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

function buildEnvelope(
  entityType: string,
  deviceId: string,
  items: SyncQueueItem[],
) {
  return {
    deviceId,
    items: items.map((x) => x.payload),
  } as SyncBatchRequest;
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
        status: 'RETRYABLE_ERROR',
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
      if ((item.status === 'PENDING' || item.status === 'RETRYABLE_ERROR') && item.nextAttemptAt <= now) {
        pending.push(item);
      }
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
          status: 'SYNCED',
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
          status: 'RETRYABLE_ERROR',
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
          status: 'FATAL_ERROR',
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

      // Erro genérico => retry (até maxRetries)
      if (r.status === 'error') {
        const nextRetry = item.retryCount + 1;
        if (nextRetry > maxRetries) {
          await q.put({
            ...item,
            status: 'DEAD_LETTER',
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
            status: 'RETRYABLE_ERROR',
            inFlightAt: undefined,
            retryCount: nextRetry,
            nextAttemptAt: next,
            lastError: r.reason ?? 'error',
          });
        }
        continue;
      }

      // Fallback defensivo — não esperado dado o contrato
      await q.put({
        ...item,
        status: 'DEAD_LETTER',
        nextAttemptAt: Number.MAX_SAFE_INTEGER,
        inFlightAt: undefined,
        lastError: 'unknown_status',
      });
      dead++;
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
    status: 'FATAL_ERROR',
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
      status: 'RETRYABLE_ERROR',
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
        status: 'FATAL_ERROR',
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
        status: 'DEAD_LETTER',
        nextAttemptAt: Number.MAX_SAFE_INTEGER,
        inFlightAt: undefined,
        lastError: reason,
      });
      continue;
    }

    const next = computeNextAttemptAt(nextRetry);
    await store.put({
      ...item,
      status: 'RETRYABLE_ERROR',
      inFlightAt: undefined,
      retryCount: nextRetry,
      nextAttemptAt: next,
      lastError: reason,
    });
  }

  await tx.done;
}
