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