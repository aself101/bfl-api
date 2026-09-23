/**
 * Test double for the native-fetch HTTP layer.
 *
 * `src/http.ts` calls `fetch(url, init)` and reads a real `Response`. Rather
 * than hand-build Response objects at ~100 call sites, this records each call
 * as the (url, body, config) tuple axios used to receive and turns whatever the
 * recorder returns into a genuine `Response` — so assertions stay readable and
 * the code under test exercises the real streaming/parsing path.
 *
 * `httpCalls.get` / `httpCalls.post` are ordinary `vi.fn()`s, so the full mock
 * vocabulary works: `mockResolvedValue({ data })`, `mockRejectedValue(err)`,
 * `mockImplementation(...)`, and `toHaveBeenCalledWith(url, body, config)`.
 *
 * One deliberate asymmetry: fetch does **not** throw on 4xx/5xx. An axios-shaped
 * rejection carrying `.response` is therefore replayed as a *resolved* Response
 * with that status, which is what the server would really do. Only rejections
 * with no `.response` become transport failures, shaped the way undici shapes
 * them (`TypeError: fetch failed` with the code on `.cause`).
 */

import { vi } from 'vitest';

/** An axios-shaped fixture: `{ data, status?, headers? }`. */
export interface HttpFixture {
  data?: unknown;
  status?: number;
  headers?: Record<string, string>;
}

/** Recorded calls, shaped like the axios methods they replaced. */
export const httpCalls = {
  get: vi.fn(),
  post: vi.fn(),
};

function isBinary(value: unknown): value is Buffer | ArrayBuffer | Uint8Array {
  return Buffer.isBuffer(value) || value instanceof ArrayBuffer || value instanceof Uint8Array;
}

/** Turn a fixture into a real Response. */
function toResponse(fixture: unknown): Response {
  if (fixture instanceof Response) return fixture;

  const f = (fixture ?? {}) as HttpFixture;
  const status = f.status ?? 200;
  const headers: Record<string, string> = { ...(f.headers ?? {}) };
  const data = f.data;

  if (isBinary(data)) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    return new Response(new Uint8Array(buf), { status, headers });
  }

  if (data === undefined) return new Response(null, { status, headers });

  if (typeof data === 'string') return new Response(data, { status, headers });

  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/**
 * Replay a recorder rejection the way the network would deliver it.
 * With `.response` it was an HTTP status (fetch resolves); without, a transport
 * failure (fetch rejects with TypeError, real code on `.cause`).
 */
function replayRejection(error: unknown): Response {
  const e = error as {
    response?: { status?: number; data?: unknown; headers?: Record<string, string> };
    code?: string;
    message?: string;
  };

  if (e?.response) {
    return toResponse({
      data: e.response.data,
      status: e.response.status ?? 500,
      headers: e.response.headers,
    });
  }

  const failure = new TypeError('fetch failed');
  (failure as TypeError & { cause?: unknown }).cause = e?.code
    ? { code: e.code, message: e.message }
    : error;
  throw failure;
}

/**
 * Install the fetch mock. Call once per suite (in `beforeAll`), then drive it
 * through `httpCalls`.
 */
export function installHttpMock(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      const rawBody = init?.body;
      let body: unknown;
      if (typeof rawBody === 'string') {
        try {
          body = JSON.parse(rawBody) as unknown;
        } catch {
          body = rawBody;
        }
      }
      // dispatcher is recorded so tests can assert downloads go through the
      // connect-time SSRF guard (src/utils.ts createGuardedLookup).
      const config = {
        headers: init?.headers as Record<string, string> | undefined,
        dispatcher: (init as { dispatcher?: unknown } | undefined)?.dispatcher,
      };

      try {
        const recorded =
          method === 'POST'
            ? ((await httpCalls.post(url, body, config)) as unknown)
            : ((await httpCalls.get(url, config)) as unknown);
        return toResponse(recorded);
      } catch (error) {
        return replayRejection(error);
      }
    })
  );
}

/** Reset recorded calls and queued behaviour. */
export function resetHttpMock(): void {
  httpCalls.get.mockReset();
  httpCalls.post.mockReset();
  // A recorder with no queued behaviour returns undefined -> an empty 200.
  httpCalls.get.mockResolvedValue({ data: {} });
  httpCalls.post.mockResolvedValue({ data: {} });
}

/** The (url, body, config) tuple of the most recent POST. */
export function lastPost(): { url: string; body: Record<string, unknown>; config: unknown } {
  const calls = httpCalls.post.mock.calls;
  const [url, body, config] = calls[calls.length - 1] as [string, Record<string, unknown>, unknown];
  return { url, body, config };
}

/** The (url, config) tuple of the most recent GET. */
export function lastGet(): { url: string; config: unknown } {
  const calls = httpCalls.get.mock.calls;
  const [url, config] = calls[calls.length - 1] as [string, unknown];
  return { url, config };
}
