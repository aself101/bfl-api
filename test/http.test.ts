/**
 * Tests for src/http.ts against a real local server.
 *
 * These deliberately do NOT mock fetch: the whole point of this module is the
 * behaviour fetch does not provide (throwing on non-2xx, capping body size mid
 * stream, bounding and re-validating redirects), and a mock would assert our
 * own assumptions back at us. Everything here talks to a real socket.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import {
  request,
  requestJson,
  requestBytes,
  BflHttpError,
  BflNetworkError,
  BflTimeoutError,
} from '../src/http.js';
import { Agent } from 'undici';
import type { LookupAddress } from 'dns';
import { createGuardedLookup } from '../src/utils.js';
import type { AllAddressResolver } from '../src/utils.js';

/** Routes keyed by path; each writes its own response. */
type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

let server: http.Server;
let base: string;
const routes = new Map<string, Handler>();

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    const handler = routes.get(path);
    if (!handler) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ detail: 'no route' }));
      return;
    }
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('http: success paths', () => {
  it('parses a JSON body', async () => {
    routes.set('/json', (_q, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'abc', status: 'Ready' }));
    });
    const body = await requestJson<{ id: string; status: string }>(`${base}/json`, {
      timeoutMs: 5000,
    });
    expect(body).toEqual({ id: 'abc', status: 'Ready' });
  });

  it('sends a JSON body and the given headers on POST', async () => {
    let seenBody = '';
    let seenKey: string | undefined;
    routes.set('/echo', (req, res) => {
      seenKey = req.headers['x-key'] as string | undefined;
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        seenBody = Buffer.concat(chunks).toString();
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });

    await requestJson(`${base}/echo`, {
      method: 'POST',
      headers: { 'x-key': 'secret', 'content-type': 'application/json' },
      json: { prompt: 'a cat' },
      timeoutMs: 5000,
    });

    expect(JSON.parse(seenBody)).toEqual({ prompt: 'a cat' });
    expect(seenKey).toBe('secret');
  });

  it('returns raw bytes for binary content', async () => {
    const payload = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    routes.set('/bin', (_q, res) => {
      res.writeHead(200, { 'content-type': 'image/jpeg' });
      res.end(payload);
    });
    const bytes = await requestBytes(`${base}/bin`, { timeoutMs: 5000 });
    expect(Buffer.compare(bytes, payload)).toBe(0);
  });
});

describe('http: non-2xx throws (fetch resolves; we must not)', () => {
  it('throws BflHttpError carrying status and parsed body', async () => {
    routes.set('/422', (_q, res) => {
      res.writeHead(422, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 't1', status: 'Error', details: { error: 'bad input' } }));
    });

    const err = await requestJson(`${base}/422`, { timeoutMs: 5000 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BflHttpError);
    const httpErr = err as BflHttpError;
    expect(httpErr.status).toBe(422);
    expect(httpErr.body).toEqual({ id: 't1', status: 'Error', details: { error: 'bad input' } });
  });

  it('keeps a non-JSON error body as text', async () => {
    routes.set('/html', (_q, res) => {
      res.writeHead(500, { 'content-type': 'text/html' });
      res.end('<html>nope</html>');
    });
    const err = (await requestJson(`${base}/html`, { timeoutMs: 5000 }).catch(
      (e: unknown) => e
    )) as BflHttpError;
    expect(err.status).toBe(500);
    expect(err.body).toBe('<html>nope</html>');
  });

  it('reads Retry-After in delta-seconds', async () => {
    routes.set('/503', (_q, res) => {
      res.writeHead(503, { 'retry-after': '7', 'content-type': 'application/json' });
      res.end(JSON.stringify({ detail: 'busy' }));
    });
    const err = (await requestJson(`${base}/503`, { timeoutMs: 5000 }).catch(
      (e: unknown) => e
    )) as BflHttpError;
    expect(err.status).toBe(503);
    expect(err.retryAfter).toBe(7);
  });

  it('does NOT write an error body through as binary content', async () => {
    // The regression this guards: under a naive fetch port, a 403 on a signed
    // URL would be returned as bytes and written to disk as the media file.
    routes.set('/403', (_q, res) => {
      res.writeHead(403, { 'content-type': 'application/xml' });
      res.end('<Error>AccessDenied</Error>');
    });
    await expect(requestBytes(`${base}/403`, { timeoutMs: 5000 })).rejects.toBeInstanceOf(
      BflHttpError
    );
  });
});

describe('http: streaming size cap', () => {
  it('aborts once the body exceeds maxBytes, without buffering it all', async () => {
    const chunk = Buffer.alloc(64 * 1024, 7);
    routes.set('/flood', (_q, res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      // 8MB in 64KB chunks, written until the peer goes away.
      let sent = 0;
      const pump = (): void => {
        while (sent < 8 * 1024 * 1024) {
          sent += chunk.byteLength;
          if (!res.write(chunk)) {
            res.once('drain', pump);
            return;
          }
        }
        res.end();
      };
      pump();
    });

    await expect(
      requestBytes(`${base}/flood`, { timeoutMs: 5000, maxBytes: 256 * 1024 })
    ).rejects.toThrow('exceeds maximum size');
  });

  it('allows a body exactly at the ceiling', async () => {
    const payload = Buffer.alloc(1024, 3);
    routes.set('/exact', (_q, res) => {
      res.writeHead(200);
      res.end(payload);
    });
    const bytes = await requestBytes(`${base}/exact`, { timeoutMs: 5000, maxBytes: 1024 });
    expect(bytes.byteLength).toBe(1024);
  });
});

describe('http: redirects', () => {
  it('follows a redirect up to the budget', async () => {
    routes.set('/hop1', (_q, res) => {
      res.writeHead(302, { location: `${base}/hop2` });
      res.end();
    });
    routes.set('/hop2', (_q, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ arrived: true }));
    });
    const body = await requestJson<{ arrived: boolean }>(`${base}/hop1`, { timeoutMs: 5000 });
    expect(body.arrived).toBe(true);
  });

  it('refuses to exceed maxRedirects', async () => {
    routes.set('/loop', (_q, res) => {
      res.writeHead(302, { location: `${base}/loop` });
      res.end();
    });
    await expect(
      requestJson(`${base}/loop`, { timeoutMs: 5000, maxRedirects: 3 })
    ).rejects.toThrow('Too many redirects');
  });

  it('calls validateHop with each target and honours a refusal', async () => {
    routes.set('/evil', (_q, res) => {
      res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
      res.end();
    });

    const seen: string[] = [];
    await expect(
      requestBytes(`${base}/evil`, {
        timeoutMs: 5000,
        validateHop: (url) => {
          seen.push(url);
          throw new Error('Access to internal/private IP addresses is not allowed');
        },
      })
    ).rejects.toThrow('Access to internal/private IP addresses is not allowed');

    // The guarantee: the target was offered for validation BEFORE being fetched.
    expect(seen).toEqual(['http://169.254.169.254/latest/meta-data/']);
  });

  it('resolves a relative Location against the current URL', async () => {
    routes.set('/rel', (_q, res) => {
      res.writeHead(302, { location: '/rel-target' });
      res.end();
    });
    routes.set('/rel-target', (_q, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: 1 }));
    });
    const seen: string[] = [];
    await requestJson(`${base}/rel`, { timeoutMs: 5000, validateHop: (u) => void seen.push(u) });
    expect(seen).toEqual([`${base}/rel-target`]);
  });

  it('drops the body and switches to GET on a 303 after POST', async () => {
    let targetMethod = '';
    routes.set('/post-redirect', (_q, res) => {
      res.writeHead(303, { location: `${base}/after` });
      res.end();
    });
    routes.set('/after', (req, res) => {
      targetMethod = req.method ?? '';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: 1 }));
    });
    await requestJson(`${base}/post-redirect`, {
      method: 'POST',
      json: { a: 1 },
      timeoutMs: 5000,
    });
    expect(targetMethod).toBe('GET');
  });
});

describe('http: transport failures are typed', () => {
  it('wraps a refused connection as a retryable BflNetworkError', async () => {
    // Bind then immediately release a port so the refusal is genuine. (Do not
    // reach for a low port: fetch rejects those as "bad port" without ever
    // connecting, which looks like a network error but tests nothing.)
    const probe = http.createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const deadPort = (probe.address() as AddressInfo).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));

    const err = (await requestJson(`http://127.0.0.1:${deadPort}/nope`, { timeoutMs: 2000 }).catch(
      (e: unknown) => e
    )) as BflNetworkError;
    expect(err).toBeInstanceOf(BflNetworkError);
    expect(err.code).toBe('ECONNREFUSED');
    expect(err.retryable).toBe(true);
  });

  it('wraps a socket reset as retryable, under undici\'s code name', async () => {
    routes.set('/reset', (req, res) => {
      // Kill the connection mid-response.
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('{"part":');
      req.socket.destroy();
    });
    const err = (await requestJson(`${base}/reset`, { timeoutMs: 3000 }).catch(
      (e: unknown) => e
    )) as BflNetworkError;
    expect(err).toBeInstanceOf(BflNetworkError);
    expect(err.retryable).toBe(true);
  });

  it('times out on an idle connection', async () => {
    routes.set('/hang', () => {
      /* never responds */
    });
    const err = (await requestJson(`${base}/hang`, { timeoutMs: 150 }).catch(
      (e: unknown) => e
    )) as BflTimeoutError;
    expect(err).toBeInstanceOf(BflTimeoutError);
    expect(err.timeoutMs).toBe(150);
  });

  it('does NOT time out a slow but progressing download (idle, not total)', async () => {
    routes.set('/slow', (_q, res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      let n = 0;
      const tick = setInterval(() => {
        n += 1;
        res.write(Buffer.alloc(16, 1));
        if (n === 6) {
          clearInterval(tick);
          res.end();
        }
      }, 60); // 6 chunks * 60ms = 360ms total, each gap under the 200ms idle limit
    });
    const bytes = await requestBytes(`${base}/slow`, { timeoutMs: 200 });
    expect(bytes.byteLength).toBe(96);
  });
});

// ---------------------------------------------------------------------------
// Connect-time SSRF guard (DNS rebinding). Real sockets and real global fetch
// with an npm-undici Agent as the dispatcher: this suite is also the evidence
// that undici 7 pairs with Node's fetch — an undici 8 Agent fails the control
// with UND_ERR_INVALID_ARG (docs/DECISIONS.md #15).
// ---------------------------------------------------------------------------

describe('dispatcher: connect-time SSRF guard', () => {
  let guardServer: http.Server;
  let port: number;
  let connections = 0;
  const agents: Agent[] = [];
  const agentWith = (lookup: ReturnType<typeof createGuardedLookup>): Agent => {
    const agent = new Agent({ connect: { lookup } });
    agents.push(agent);
    return agent;
  };

  beforeAll(async () => {
    guardServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('reached');
    });
    guardServer.on('connection', () => { connections += 1; });
    await new Promise<void>(resolve => guardServer.listen(0, '127.0.0.1', resolve));
    port = (guardServer.address() as AddressInfo).port;
  });
  afterAll(async () => {
    await Promise.all(agents.map(a => a.close()));
    await new Promise<void>(resolve => guardServer.close(() => resolve()));
  });

  const loopback: AllAddressResolver = (_host, _opts, cb) => cb(null, [{ address: '127.0.0.1', family: 4 }]);
  /** Answers public first, loopback after: the rebinding attacker's DNS. */
  const rebinding = (): AllAddressResolver => {
    let calls = 0;
    return (_host, _opts, cb) => {
      calls += 1;
      cb(null, [calls === 1 ? { address: '93.184.216.34', family: 4 } : { address: '127.0.0.1', family: 4 }]);
    };
  };
  /** The check validateImageUrl performs, run against the same resolver. */
  const checkTime = (resolve: AllAddressResolver): Promise<LookupAddress[]> =>
    new Promise((ok, fail) => resolve('localhost', { all: true }, (err, addrs) => (err ? fail(err) : ok(addrs))));

  it('refuses to connect when the name resolves to a blocked address', async () => {
    connections = 0;
    const dispatcher = agentWith(createGuardedLookup(loopback));
    const error = await request(`http://localhost:${port}/`, { timeoutMs: 5000, dispatcher }).catch(e => e);
    expect(error.code).toBe('ESSRFBLOCKED');
    expect(error.message).toContain('resolves to internal/private IP address');
    expect(connections).toBe(0);
  });

  it('control: the same request connects when the guard allows the address', async () => {
    connections = 0;
    const dispatcher = agentWith(createGuardedLookup(loopback, () => false));
    const res = await request(`http://localhost:${port}/`, { timeoutMs: 5000, dispatcher });
    expect(res.status).toBe(200);
    expect(res.bytes.toString()).toBe('reached');
    expect(connections).toBe(1);
  });

  it('rebinding without the guard: the check passes and the connection still lands on loopback', async () => {
    connections = 0;
    const resolve = rebinding();
    expect(await checkTime(resolve)).toEqual([{ address: '93.184.216.34', family: 4 }]);
    // Unguarded: the connect-time lookup is the attacker's second answer, unchecked.
    const dispatcher = agentWith(createGuardedLookup(resolve, () => false));
    const res = await request(`http://localhost:${port}/`, { timeoutMs: 5000, dispatcher });
    expect(res.status).toBe(200);
    expect(connections).toBe(1);
  });

  it('rebinding with the guard: the connect-time answer is checked, so the connection is refused', async () => {
    connections = 0;
    const resolve = rebinding();
    expect(await checkTime(resolve)).toEqual([{ address: '93.184.216.34', family: 4 }]);
    const dispatcher = agentWith(createGuardedLookup(resolve));
    const error = await request(`http://localhost:${port}/`, { timeoutMs: 5000, dispatcher }).catch(e => e);
    expect(error.code).toBe('ESSRFBLOCKED');
    expect(connections).toBe(0);
  });
});
