import type { ProxiedFetch, ProxiedFetchInit } from '../engine/settings/settings_scripts/settings_script.js';

function normalizeHeaders(headers: ProxiedFetchInit['headers']): Array<{ name: string; value: string }> {
  if (!headers) {
    return [];
  }

  if (Array.isArray(headers)) {
    return headers.map(([name, value]) => ({ name, value }));
  }

  return Object.entries(headers).map(([name, value]) => ({ name, value }));
}

export function createProxiedFetch(abortSignal: AbortSignal | undefined): ProxiedFetch {
  return async (url, init) =>
    fetch('/api/proxy/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: init?.method ?? 'GET',
        url,
        headers: normalizeHeaders(init?.headers),
        body: init?.body,
      }),
      signal: abortSignal ?? null,
    });
}
