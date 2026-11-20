import { newId } from '../util/id.js';
import { SESSION_SUPERSEDED_HEADER, SessionSupersededError } from '../errors/session_superseded_error.js';

export const SESSION_ID_HEADER = 'x-yozakura-session-id';
export const CLIENT_SESSION_ID = newId();

let interceptorInstalled = false;

function resolveRequestUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) {
    return input;
  }

  const rawUrl = typeof input === 'string' ? input : input.url;
  return new URL(rawUrl, window.location.origin);
}

export function installSessionFetchInterceptor(): void {
  if (interceptorInstalled || typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return;
  }

  interceptorInstalled = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const requestUrl = resolveRequestUrl(input);

    if (requestUrl.origin !== window.location.origin || !requestUrl.pathname.startsWith('/api/')) {
      return originalFetch(input, init);
    }

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => {
        headers.set(key, value);
      });
    }
    headers.set(SESSION_ID_HEADER, CLIENT_SESSION_ID);

    const response = await originalFetch(input, { ...init, headers });
    if (response.status === 409 && response.headers.get(SESSION_SUPERSEDED_HEADER) === '1') {
      throw new SessionSupersededError();
    }

    return response;
  };
}
