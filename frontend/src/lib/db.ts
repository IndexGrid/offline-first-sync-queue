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