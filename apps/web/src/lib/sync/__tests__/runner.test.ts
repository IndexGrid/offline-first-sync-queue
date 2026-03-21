import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { runSyncOnce } from '../runner';
import { getDB } from '../../db';

describe('runSyncOnce', () => {
  beforeEach(async () => {
    // Clear the DB before each test
    const db = await getDB();
    const tx = db.transaction(['syncQueue', 'orders'], 'readwrite');
    await tx.objectStore('syncQueue').clear();
    await tx.objectStore('orders').clear();
    await tx.done;
    
    vi.clearAllMocks();
  });

  it('should group items by URL and send batches', async () => {
    const db = await getDB();
    const now = Date.now();
    
    // Add items to the queue
    const tx = db.transaction('syncQueue', 'readwrite');
    await tx.objectStore('syncQueue').add({
      id: '1',
      externalId: 'ext-1',
      entityType: 'order',
      status: 'PENDING',
      nextAttemptAt: now - 1000,
      createdAt: now - 2000,
      payload: { data: 'test1' },
      url: 'v1/pos/sync',
      method: 'POST',
      op: 'UPSERT',
      retryCount: 0
    });
    await tx.done;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: [{ externalId: 'ext-1', status: 'created' }]
      })
    });

    const result = await runSyncOnce({
      batchSize: 10,
      fetchImpl: mockFetch as unknown as typeof fetch,
      deviceId: 'test-device'
    });

    expect(result.sent).toBe(1);
    expect(result.acked).toBe(1);
    expect(mockFetch).toHaveBeenCalled();
    
    // Check if item status is updated to SYNCED
    const updatedItem = await db.get('syncQueue', '1');
    expect(updatedItem?.status).toBe('SYNCED');
  });

  it('should handle partial failures in a batch', async () => {
    const db = await getDB();
    const now = Date.now();
    
    const tx = db.transaction('syncQueue', 'readwrite');
    await tx.objectStore('syncQueue').add({
      id: '1',
      externalId: 'ext-1',
      entityType: 'order',
      status: 'PENDING',
      nextAttemptAt: now - 1000,
      createdAt: now - 2000,
      payload: { data: 'test1' },
      url: 'v1/pos/sync',
      method: 'POST',
      op: 'UPSERT',
      retryCount: 0
    });
    await tx.objectStore('syncQueue').add({
      id: '2',
      externalId: 'ext-2',
      entityType: 'order',
      status: 'PENDING',
      nextAttemptAt: now - 1000,
      createdAt: now - 2000,
      payload: { data: 'test2' },
      url: 'v1/pos/sync',
      method: 'POST',
      op: 'UPSERT',
      retryCount: 0
    });
    await tx.done;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: [
          { externalId: 'ext-1', status: 'created' },
          { externalId: 'ext-2', status: 'error', reason: 'validation_failed' }
        ]
      })
    });

    const result = await runSyncOnce({
      batchSize: 10,
      fetchImpl: mockFetch as unknown as typeof fetch,
      maxRetries: 3
    });

    expect(result.acked).toBe(1);
    expect(result.dead).toBe(0); // Should be retryable error initially
    
    const item1 = await db.get('syncQueue', '1');
    const item2 = await db.get('syncQueue', '2');
    
    expect(item1?.status).toBe('SYNCED');
    expect(item2?.status).toBe('RETRYABLE_ERROR');
    expect(item2?.retryCount).toBe(1);
  });

  it('should recover stale IN_FLIGHT items', async () => {
    const db = await getDB();
    const now = Date.now();
    
    const tx = db.transaction('syncQueue', 'readwrite');
    await tx.objectStore('syncQueue').add({
      id: '1',
      externalId: 'ext-1',
      entityType: 'order',
      status: 'IN_FLIGHT',
      inFlightAt: now - 120000, // 2 minutes ago
      nextAttemptAt: now - 130000,
      createdAt: now - 140000,
      payload: { data: 'stale' },
      url: 'v1/pos/sync',
      method: 'POST',
      op: 'UPSERT',
      retryCount: 0
    });
    await tx.done;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: [{ externalId: 'ext-1', status: 'created' }]
      })
    });

    // Run sync, it should first recover the stale item
    const result = await runSyncOnce({
      batchSize: 10,
      fetchImpl: mockFetch as unknown as typeof fetch,
      staleInFlightAfterMs: 60000 // 1 minute
    });

    expect(result.sent).toBe(1);
    expect(result.acked).toBe(1);
    
    const recoveredItem = await db.get('syncQueue', '1');
    expect(recoveredItem?.status).toBe('SYNCED');
  });

  it('should transition to DEAD_LETTER after max retries', async () => {
    const db = await getDB();
    const now = Date.now();
    
    const tx = db.transaction('syncQueue', 'readwrite');
    await tx.objectStore('syncQueue').add({
      id: '1',
      externalId: 'ext-dead',
      entityType: 'order',
      status: 'PENDING',
      nextAttemptAt: now - 1000,
      createdAt: now - 2000,
      payload: { data: 'fail' },
      url: 'v1/pos/sync',
      method: 'POST',
      op: 'UPSERT',
      retryCount: 10 // Max retries reached
    });
    await tx.done;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: [{ externalId: 'ext-dead', status: 'error', reason: 'permanent_fail' }]
      })
    });

    const result = await runSyncOnce({
      batchSize: 10,
      fetchImpl: mockFetch as unknown as typeof fetch,
      maxRetries: 10
    });

    expect(result.dead).toBe(1);
    
    const item = await db.get('syncQueue', '1');
    expect(item?.status).toBe('DEAD_LETTER');
    expect(item?.lastError).toBe('permanent_fail');
  });

  it('should handle network errors with exponential backoff', async () => {
    const db = await getDB();
    const now = Date.now();
    
    const tx = db.transaction('syncQueue', 'readwrite');
    await tx.objectStore('syncQueue').add({
      id: '1',
      externalId: 'ext-net',
      entityType: 'order',
      status: 'PENDING',
      nextAttemptAt: now - 1000,
      createdAt: now - 2000,
      payload: { data: 'net' },
      url: 'v1/pos/sync',
      method: 'POST',
      op: 'UPSERT',
      retryCount: 0
    });
    await tx.done;

    const mockFetch = vi.fn().mockRejectedValue(new Error('Network timeout'));

    await runSyncOnce({
      batchSize: 10,
      fetchImpl: mockFetch as unknown as typeof fetch
    });

    const item = await db.get('syncQueue', '1');
    expect(item?.status).toBe('RETRYABLE_ERROR');
    expect(item?.retryCount).toBe(1);
    expect(item?.nextAttemptAt).toBeGreaterThan(now);
  });

  it('should split batches when maxBatchPayloadSize is exceeded (chunking rules)', async () => {
    const db = await getDB();
    const now = Date.now();

    const payload1 = {
      externalId: 'ext-chunk-1',
      entityType: 'order',
      payload: { big: 'a'.repeat(200) },
    };
    const payload2 = {
      externalId: 'ext-chunk-2',
      entityType: 'order',
      payload: { big: 'b'.repeat(200) },
    };

    const sizeBoth = new TextEncoder().encode(
      JSON.stringify({ deviceId: 'test-device', items: [payload1, payload2] }),
    ).length;
    const maxBytes = sizeBoth - 1;

    const tx = db.transaction('syncQueue', 'readwrite');
    await tx.objectStore('syncQueue').add({
      id: '1',
      externalId: 'ext-chunk-1',
      entityType: 'order',
      status: 'PENDING',
      nextAttemptAt: now - 1000,
      createdAt: now - 2000,
      payload: payload1,
      url: 'v1/pos/sync',
      method: 'POST',
      op: 'UPSERT',
      retryCount: 0,
    });
    await tx.objectStore('syncQueue').add({
      id: '2',
      externalId: 'ext-chunk-2',
      entityType: 'order',
      status: 'PENDING',
      nextAttemptAt: now - 1000,
      createdAt: now - 2000,
      payload: payload2,
      url: 'v1/pos/sync',
      method: 'POST',
      op: 'UPSERT',
      retryCount: 0,
    });
    await tx.done;

    const mockFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body as string;
      const parsed = JSON.parse(body) as {
        items: Array<{ externalId: string }>;
      };
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            results: parsed.items.map((it) => ({
              externalId: it.externalId,
              status: 'created',
            })),
          }),
      };
    });

    const result = await runSyncOnce({
      batchSize: 10,
      fetchImpl: mockFetch as unknown as typeof fetch,
      deviceId: 'test-device',
      maxBatchPayloadSize: maxBytes,
    });

    expect(result.sent).toBe(2);
    expect(result.acked).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const call1Body = (mockFetch.mock.calls[0]?.[1]?.body ?? '') as string;
    const call2Body = (mockFetch.mock.calls[1]?.[1]?.body ?? '') as string;
    const items1 = (JSON.parse(call1Body) as { items: unknown[] }).items;
    const items2 = (JSON.parse(call2Body) as { items: unknown[] }).items;
    expect(items1).toHaveLength(1);
    expect(items2).toHaveLength(1);

    const updated1 = await db.get('syncQueue', '1');
    const updated2 = await db.get('syncQueue', '2');
    expect(updated1?.status).toBe('SYNCED');
    expect(updated2?.status).toBe('SYNCED');
  });

  it('should mark a single oversized item as FATAL_ERROR without calling fetch', async () => {
    const db = await getDB();
    const now = Date.now();

    const hugePayload = {
      externalId: 'ext-huge',
      entityType: 'order',
      payload: { big: 'x'.repeat(2000) },
    };

    const singleSize = new TextEncoder().encode(
      JSON.stringify({ deviceId: 'test-device', items: [hugePayload] }),
    ).length;
    const maxBytes = singleSize - 1;

    const tx = db.transaction('syncQueue', 'readwrite');
    await tx.objectStore('syncQueue').add({
      id: '1',
      externalId: 'ext-huge',
      entityType: 'order',
      status: 'PENDING',
      nextAttemptAt: now - 1000,
      createdAt: now - 2000,
      payload: hugePayload,
      url: 'v1/pos/sync',
      method: 'POST',
      op: 'UPSERT',
      retryCount: 0,
    });
    await tx.done;

    const mockFetch = vi.fn();

    const result = await runSyncOnce({
      batchSize: 10,
      fetchImpl: mockFetch as unknown as typeof fetch,
      deviceId: 'test-device',
      maxBatchPayloadSize: maxBytes,
    });

    expect(result.sent).toBe(1);
    expect(result.acked).toBe(0);
    expect(result.dead).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();

    const item = await db.get('syncQueue', '1');
    expect(item?.status).toBe('FATAL_ERROR');
    expect(item?.lastError?.startsWith('payload_too_large_local:')).toBe(true);
  });
});
