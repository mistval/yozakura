import express, { type Router } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const EXCLUDED_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'x-target-url',
]);

export default function proxyRouter(): Router {
  const router = express.Router();

  router.all('/proxy/fetch', async (req, res) => {
    const upstreamAbortController = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) {
        upstreamAbortController.abort();
      }
    });

    try {
      const targetUrl = req.headers['x-target-url'];
      if (!targetUrl || typeof targetUrl !== 'string') {
        res.status(400).json({ error: 'Missing X-Target-URL header' });
        return;
      }

      const requestHeaders: Record<string, string> = {};
      for (const [name, value] of Object.entries(req.headers)) {
        if (!EXCLUDED_REQUEST_HEADERS.has(name.toLowerCase()) && typeof value === 'string') {
          requestHeaders[name] = value;
        }
      }

      const method = req.method.toUpperCase();
      const canHaveBody = method !== 'GET' && method !== 'HEAD';

      const requestInit: RequestInit & { duplex?: string } = {
        method,
        headers: requestHeaders,
        signal: upstreamAbortController.signal,
      };

      if (canHaveBody) {
        requestInit.body = Readable.toWeb(req) as ReadableStream;
        requestInit.duplex = 'half';
      }

      const response = await fetch(targetUrl, requestInit);

      res.status(response.status);
      for (const [name, value] of response.headers.entries()) {
        res.setHeader(name, value);
      }

      if (!response.body) {
        res.end();
        return;
      }

      await pipeline(Readable.fromWeb(response.body), res);
    } catch (error) {
      if (res.headersSent || res.writableEnded) {
        res.end();
        return;
      }

      res.status(502).json({ error: 'Upstream request failed', details: (error as Error).message });
    }
  });

  return router;
}
