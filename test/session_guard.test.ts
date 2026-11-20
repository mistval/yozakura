import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, type TestServer } from './harness.js';

describe('Integration: Single Active Session Guard', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  it('rejects POST, PUT, and DELETE from older session IDs once an unseen session ID appears', async () => {
    const dbAllBody = JSON.stringify({ statement: 'SELECT 1 AS ok', parameterGroups: [] });

    // Session A registers and runs normally.
    const sessionARes = await fetch(`${server.baseUrl}/api/db/all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-yozakura-session-id': 'session-a',
      },
      body: dbAllBody,
    });
    expect(sessionARes.status).toBe(200);

    // Session B (unseen) becomes active.
    const sessionBRes = await fetch(`${server.baseUrl}/api/db/all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-yozakura-session-id': 'session-b',
      },
      body: dbAllBody,
    });
    expect(sessionBRes.status).toBe(200);

    // Session A is now rejected on POST, PUT, and DELETE.
    const stalePost = await fetch(`${server.baseUrl}/api/db/all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-yozakura-session-id': 'session-a',
      },
      body: dbAllBody,
    });
    expect(stalePost.status).toBe(409);
    expect(stalePost.headers.get('x-yozakura-session-superseded')).toBe('1');
    expect(await stalePost.json()).toMatchObject({ code: 'SESSION_SUPERSEDED' });

    const stalePut = await fetch(`${server.baseUrl}/api/files/test/sample.txt`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/plain',
        'x-yozakura-session-id': 'session-a',
      },
      body: 'hello',
    });
    expect(stalePut.status).toBe(409);
    expect(stalePut.headers.get('x-yozakura-session-superseded')).toBe('1');

    const staleDelete = await fetch(`${server.baseUrl}/api/files/test/sample.txt`, {
      method: 'DELETE',
      headers: {
        'x-yozakura-session-id': 'session-a',
      },
    });
    expect(staleDelete.status).toBe(409);
    expect(staleDelete.headers.get('x-yozakura-session-superseded')).toBe('1');

    // Session B remains active.
    const stillActiveB = await fetch(`${server.baseUrl}/api/files/test/sample.txt`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/plain',
        'x-yozakura-session-id': 'session-b',
      },
      body: 'hello',
    });
    expect(stillActiveB.status).toBe(200);

    // GET requests and requests without a session header are still allowed.
    const getRes = await fetch(`${server.baseUrl}/api/files/test/sample.txt`, {
      headers: { 'x-yozakura-session-id': 'session-a' },
    });
    expect(getRes.status).toBe(200);

    const noHeaderRes = await fetch(`${server.baseUrl}/api/db/all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: dbAllBody,
    });
    expect(noHeaderRes.status).toBe(200);

    // A reloaded client generates a new unseen ID (Session C) which supersedes Session B.
    const sessionCRes = await fetch(`${server.baseUrl}/api/db/all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-yozakura-session-id': 'session-c',
      },
      body: dbAllBody,
    });
    expect(sessionCRes.status).toBe(200);

    const staleB = await fetch(`${server.baseUrl}/api/db/all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-yozakura-session-id': 'session-b',
      },
      body: dbAllBody,
    });
    expect(staleB.status).toBe(409);
  });
});
