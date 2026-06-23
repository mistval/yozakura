import type { ProxiedFetch, ProxiedFetchInit } from '../engine/settings/settings_scripts/settings_script.js';

function normalizeHeaders(headers: ProxiedFetchInit['headers']): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return { ...headers };
}

export function createProxiedFetch(abortSignal: AbortSignal | undefined): ProxiedFetch {
  return async (url, init) =>
    fetch('/api/proxy/fetch', {
      method: init?.method ?? 'GET',
      headers: {
        ...normalizeHeaders(init?.headers),
        'X-Target-URL': url,
      },
      body: init?.body ?? null,
      signal: abortSignal ?? null,
    });
}
