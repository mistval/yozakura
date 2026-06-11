import express, { type Response } from 'express';
import z from 'zod';

const completionsRequestSchema = z.looseObject({
  targetUrl: z.string(),
  authToken: z.string().optional(),
});

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildAuthorizationHeader(authToken: unknown): string | undefined {
  if (typeof authToken !== 'string') {
    return undefined;
  }

  const trimmedToken = authToken.trim();
  if (!trimmedToken) {
    return undefined;
  }

  if (trimmedToken.toLowerCase().startsWith('bearer ')) {
    return trimmedToken;
  }

  return `Bearer ${trimmedToken}`;
}

async function pipeFetchStreamToExpress(fetchResponse: globalThis.Response, expressResponse: Response) {
  const reader = fetchResponse.body?.getReader();
  if (!reader) {
    expressResponse.end();
    return;
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (value && value.length > 0) {
        expressResponse.write(Buffer.from(value));
      }
    }
  } finally {
    expressResponse.end();
  }
}

export default function llmRouter() {
  const router = express.Router();

  router.post('/llm/chat', async (req, res) => {
    try {
      const parsed = completionsRequestSchema.parse(req.body);
      const { targetUrl, authToken, ...llmPayload } = parsed;

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const authorizationHeader = buildAuthorizationHeader(authToken);
      if (authorizationHeader) {
        headers.Authorization = authorizationHeader;
      }

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(llmPayload),
      });

      res.status(response.status);
      res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');

      if (llmPayload.stream === true) {
        await pipeFetchStreamToExpress(response, res);
        return;
      }

      const text = await response.text();
      res.send(text);
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }

      const details = toErrorMessage(error);
      res.status(502).json({ error: 'LLM server unreachable', details });
    }
  });

  router.post('/llm/test-connection', async (req, res) => {
    try {
      const { targetUrl, authToken } = completionsRequestSchema.parse(req.body);

      if (typeof targetUrl !== 'string' || !targetUrl.trim()) {
        res.status(400).json({ error: 'targetUrl is required' });
        return;
      }

      const headers: Record<string, string> = {};
      const authorizationHeader = buildAuthorizationHeader(authToken);
      if (authorizationHeader) {
        headers.Authorization = authorizationHeader;
      }

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers,
      });

      const text = await response.text();
      res.status(response.status).json({
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        body: text,
      });
    } catch (error) {
      const details = toErrorMessage(error);
      res.status(502).json({ error: 'LLM server unreachable', details });
    }
  });

  return router;
}
