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