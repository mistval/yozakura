import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import type { Router } from 'express';
import { guardPathWithinBase } from './pathGuard.js';
import z from 'zod';

const bodySchema = z.looseObject({
  imageApiUrl: z.string(),
  imageApiShape: z.enum(['openai', 'automatic1111']),
  saveTo: z.string().optional(),
  authToken: z.string().optional(),
});

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function appendIndexToFileName(filePath: string, index: number): string {
  if (index === 0) return filePath;
  const ext = path.extname(filePath);
  const basename = filePath.slice(0, -ext.length);
  return `${basename}_${index}${ext}`;
}

export default function imageRouter(dataDir: string): Router {
  const router = express.Router();

  router.post('/image/generate', async (req, res, next) => {
    try {
      const parsed = bodySchema.parse(req.body);
      const { saveTo, imageApiUrl, imageApiShape, authToken, ...payload } = parsed;

      const isOpenAI = imageApiShape === 'openai';

      const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken?.trim()) {
        requestHeaders['Authorization'] = `Bearer ${authToken.trim()}`;
      }

      try {
        const response = await fetch(imageApiUrl, {
          method: 'POST',
          headers: requestHeaders,
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          const errorPrefixText = 'Error response from image generation API provider';
          return res
            .status(response.status)
            .json({ error: `${errorPrefixText}: ${errorText}` || errorPrefixText });
        }

        let images: string[];
        if (isOpenAI) {
          const data = (await response.json()) as {
            choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
          };
          images = (data.choices ?? []).flatMap((choice) =>
            (choice.message?.images ?? []).flatMap((image) =>
              image.image_url?.url ? [image.image_url.url] : [],
            ),
          );
        } else {
          const data = (await response.json()) as { images?: string[] };
          images = Array.isArray(data.images) ? data.images : [];
        }

        const files: string[] = [];

        if (typeof saveTo === 'string' && saveTo) {
          for (let index = 0; index < images.length; index += 1) {
            const relFilePath = appendIndexToFileName(saveTo, index);
            const resolved = guardPathWithinBase(dataDir, relFilePath);
            await fs.mkdir(path.dirname(resolved), { recursive: true });
            const base64 = images[index]?.split(',').pop() ?? '';
            const buffer = Buffer.from(base64, 'base64');
            await fs.writeFile(resolved, buffer);
            files.push('/' + path.join('api', 'files', relFilePath).replaceAll('\\', '/'));
          }
        }

        return res.json({ images, files });
      } catch (error) {
        return res.status(502).json({ error: 'Image server unreachable', details: toErrorMessage(error) });
      }
    } catch (err) {
      res.status(500).json({ error: toErrorMessage(err) });
    }
  });

  return router;
}
