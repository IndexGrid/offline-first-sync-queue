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
    url: 'v1/pos/sync',
    method: 'POST',
    payload: { externalId, entityType: 'order', payload: orderData },
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