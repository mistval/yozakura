import express, { type Router } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import z from 'zod';

const bodySchema = z.object({
  method: z.string().optional(),
  url: z.string(),
  headers: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
  body: z.string().optional(),
});

export default function proxyRouter(): Router {
  const router = express.Router();

  router.post('/proxy/fetch', async (req, res) => {
    const upstreamAbortController = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) {
        upstreamAbortController.abort();
      }
    });

    try {
      const { method, url, headers, body } = bodySchema.parse(req.body);

      const requestHeaders: Record<string, string> = {};
      for (const header of headers ?? []) {
        requestHeaders[header.name] = header.value;
      }

      const requestMethod = (method ?? 'GET').toUpperCase();
      const canHaveBody = requestMethod !== 'GET' && requestMethod !== 'HEAD';

      const requestInit: RequestInit = {
        method: requestMethod,
        headers: requestHeaders,
        signal: upstreamAbortController.signal,
      };

      if (canHaveBody && body) {
        requestInit.body = body;
      }

      const response = await fetch(url, requestInit);

      res.status(response.status);
      const contentType = response.headers.get('content-type');

      if (contentType) {
        res.setHeader('Content-Type', contentType);
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
