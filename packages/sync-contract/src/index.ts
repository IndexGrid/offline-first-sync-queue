import { z } from 'zod';

/**
 * Sync status state machine definitions.
 * Following AI-Driven-Implementation-technical-guide.md Section 4.
 */
export const SyncStatusSchema = z.enum([
  'PENDING',         // Initial state, ready to be sent
  'IN_FLIGHT',       // Currently being processed by the server
  'SYNCED',          // Successfully acknowledged by server
  'RETRYABLE_ERROR', // Temporary failure, should retry
  'FATAL_ERROR',     // Permanent failure (e.g., validation), should not retry
  'DEAD_LETTER'      // Terminal state after max retries or fatal error
]);

export type SyncStatus = z.infer<typeof SyncStatusSchema>;

/**
 * Shared sync item schema.
 */
export const SyncItemSchema = z.object({
  id: z.string().uuid(),
  externalId: z.string().uuid(),
  entityType: z.string(),
  status: SyncStatusSchema,
  retryCount: z.number().int().nonnegative().default(0),
  nextAttemptAt: z.number().int(),
  lastError: z.string().optional(),
  createdAt: z.number().int(),
  payload: z.any(),
  op: z.enum(['UPSERT', 'DELETE']).default('UPSERT'),
  url: z.string(),
  method: z.enum(['POST', 'PUT', 'DELETE']).default('POST')
});

export type SyncItem = z.infer<typeof SyncItemSchema>;

/**
 * Batch sync request schema.
 */
export const SyncBatchRequestSchema = z.object({
  deviceId: z.string(),
  items: z.array(z.object({
    externalId: z.string().uuid(),
    entityType: z.string(),
    payload: z.any()
  }))
});

export type SyncBatchRequest = z.infer<typeof SyncBatchRequestSchema>;

/**
 * Per-item sync result status.
 */
export const SyncResultStatusSchema = z.enum([
  'created',
  'updated',
  'duplicate',
  'invalid',
  'auth_required',
  'error'
]);

export type SyncResultStatus = z.infer<typeof SyncResultStatusSchema>;

/**
 * Batch sync response schema.
 */
export const SyncBatchResponseSchema = z.object({
  results: z.array(z.object({
    externalId: z.string().uuid(),
    status: SyncResultStatusSchema,
    reason: z.string().optional()
  }))
});

export type SyncBatchResponse = z.infer<typeof SyncBatchResponseSchema>;
