import { describe, it, expect } from 'vitest';
import { computeNextAttemptAt, shouldRetry } from '../retry';

describe('computeNextAttemptAt', () => {
  it('should increase delay with retry count', () => {
    const attempt1 = computeNextAttemptAt(0);
    const attempt2 = computeNextAttemptAt(1);
    const attempt3 = computeNextAttemptAt(2);
    
    expect(attempt2).toBeGreaterThan(attempt1);
    expect(attempt3).toBeGreaterThan(attempt2);
  });

  it('should cap at 60 seconds', () => {
    const attempt10 = computeNextAttemptAt(10);
    const attempt20 = computeNextAttemptAt(20);
    
    // Both should be within 60 seconds from now
    expect(attempt10).toBeLessThanOrEqual(Date.now() + 60000);
    expect(attempt20).toBeLessThanOrEqual(Date.now() + 60000);
  });

  it('should add jitter', () => {
    // Run multiple times to ensure jitter is working
    const attempts = Array.from({ length: 10 }, () => computeNextAttemptAt(3));
    
    // All attempts should be different due to jitter
    const uniqueAttempts = new Set(attempts);
    expect(uniqueAttempts.size).toBeGreaterThan(5);
  });
});

describe('shouldRetry', () => {
  it('should retry on network errors', () => {
    expect(shouldRetry(undefined)).toBe(true);
  });

  it('should retry on timeout', () => {
    expect(shouldRetry(408)).toBe(true);
  });

  it('should retry on rate limit', () => {
    expect(shouldRetry(429)).toBe(true);
  });

  it('should retry on server errors', () => {
    expect(shouldRetry(500)).toBe(true);
    expect(shouldRetry(502)).toBe(true);
    expect(shouldRetry(503)).toBe(true);
    expect(shouldRetry(504)).toBe(true);
  });

  it('should not retry on client errors', () => {
    expect(shouldRetry(400)).toBe(false);
    expect(shouldRetry(401)).toBe(false);
    expect(shouldRetry(403)).toBe(false);
    expect(shouldRetry(413)).toBe(false);
  });

  it('should not retry on success', () => {
    expect(shouldRetry(200)).toBe(false);
    expect(shouldRetry(201)).toBe(false);
    expect(shouldRetry(204)).toBe(false);
  });
});