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