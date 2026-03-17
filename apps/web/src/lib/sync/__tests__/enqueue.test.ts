import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { getDB } from '../../db';
import { enqueueOrder } from '../enqueue';

describe('enqueueOrder', () => {
  beforeEach(async () => {
    const db = await getDB();
    // Clear all stores
    const tx = db.transaction(['orders', 'syncQueue', 'dedupe'], 'readwrite');
    await tx.objectStore('orders').clear();
    await tx.objectStore('syncQueue').clear();
    await tx.objectStore('dedupe').clear();
    await tx.done;
  });

  afterEach(async () => {
    // Cleanup after each test
    const db = await getDB();
    const tx = db.transaction(['orders', 'syncQueue', 'dedupe'], 'readwrite');
    await tx.objectStore('orders').clear();
    await tx.objectStore('syncQueue').clear();
    await tx.objectStore('dedupe').clear();
    await tx.done;
  });

  it('should create order and sync queue item', async () => {
    const orderData = {
      customer: 'John Doe',
      items: [{ sku: 'PROD001', qty: 2, price: 10.00 }],
      total: 20.00
    };

    const result = await enqueueOrder(orderData);

    expect(result.externalId).toBeDefined();
    expect(result.externalId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

    const db = await getDB();
    
    // Check order was created
    const order = await db.get('orders', result.externalId);
    expect(order).toBeDefined();
    if (order) {
      expect(order.data).toEqual(orderData);
      expect(order.syncStatus).toBe('LOCAL_ONLY');
    }

    // Check sync queue item was created
    const syncItems = await db.getAll('syncQueue');
    expect(syncItems).toHaveLength(1);
    expect(syncItems[0].externalId).toBe(result.externalId);
    expect(syncItems[0].status).toBe('PENDING');
    expect(syncItems[0].entityType).toBe('order');
  });

  it('should deduplicate identical orders within window', async () => {
    const orderData = {
      customer: 'Jane Doe',
      items: [{ sku: 'PROD002', qty: 1, price: 15.00 }],
      total: 15.00
    };

    const result1 = await enqueueOrder(orderData);
    const result2 = await enqueueOrder(orderData);

    expect(result1.externalId).toBe(result2.externalId);

    const db = await getDB();
    const syncItems = await db.getAll('syncQueue');
    expect(syncItems).toHaveLength(1); // Only one sync item should be created
  });

  it('should allow different orders', async () => {
    const orderData1 = {
      customer: 'Customer 1',
      items: [{ sku: 'PROD001', qty: 1, price: 10.00 }],
      total: 10.00
    };

    const orderData2 = {
      customer: 'Customer 2',
      items: [{ sku: 'PROD002', qty: 1, price: 20.00 }],
      total: 20.00
    };

    const result1 = await enqueueOrder(orderData1);
    const result2 = await enqueueOrder(orderData2);

    expect(result1.externalId).not.toBe(result2.externalId);

    const db = await getDB();
    const syncItems = await db.getAll('syncQueue');
    expect(syncItems).toHaveLength(2);
  });

  it('should respect custom dedupe window', async () => {
    const orderData = {
      customer: 'Test Customer',
      items: [{ sku: 'PROD001', qty: 1, price: 10.00 }],
      total: 10.00
    };

    const result1 = await enqueueOrder(orderData, { dedupeWindowMs: 0 });
    const result2 = await enqueueOrder(orderData, { dedupeWindowMs: 0 });

    expect(result1.externalId).not.toBe(result2.externalId);
  });
});