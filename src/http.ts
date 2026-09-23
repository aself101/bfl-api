/**
 * HTTP layer — native fetch.
 *
 * Everything axios used to do implicitly is explicit here, because each piece
 * is load-bearing and fetch provides none of it:
 *
 * - **Non-2xx throws.** fetch resolves on 4xx/5xx. Without this, an error page
 *   is a successful response: `downloadMedia` would write it to disk as the
 *   media file and `urlToBase64` would base64 it and post it to the API.
 * - **Streaming size cap.** fetch has no `maxContentLength`; `arrayBuffer()`
 *   buffers the whole body first, so a post-hoc length check is not a cap at
 *   all. The body is read chunk-by-chunk and aborted the moment it exceeds.
 * - **Redirect budget with per-hop validation.** fetch offers `follow` (cap 20,
 *   unobservable) or `manual`. We follow manually so each hop can be
 *   re-validated — axios followed redirects blind, so a URL that passed the
 *   SSRF check could 302 to an internal address (or downgrade to http) and the
 *   body came back anyway. See docs/DECISIONS.md #11.
 * - **Typed errors.** Transport failures surface as `TypeError: fetch failed`
 *   with the real code on `.cause.code`, and undici's names differ from Node's
 *   (`UND_ERR_SOCKET`, not `ECONNRESET`). Callers classify on fields, never on
 *   message text.
 *
 * Timeouts are *idle* timeouts, matching what Node's socket timeout gave us
 * before: the clock resets on each chunk, so a large but progressing download
 * is not killed mid-flight.
 *
 * - **Optional dispatcher.** Media downloads pass an undici `Agent` whose
 *   connect-time lookup refuses private addresses (utils.ts
 *   `createGuardedLookup`), which is what closes the DNS-rebinding window that
 *   `validateHop` alone leaves open. API calls use the default dispatcher.
 *   Ported from stability-ai-api 1.0.1.
 */

import type { Dispatcher } from 'undici';

/** Statuses that may carry a `Location` we should follow. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Transport-level failure codes worth retrying. Undici's vocabulary, not Node's. */
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);

/**
 * `.code` of the error a connect-time SSRF guard raises (utils.ts
 * `createGuardedLookup`). Defined here rather than in utils.ts because utils
 * imports this module. `asTypedError` rethrows the guard's own error, so a
 * refused download reads as a refusal, not as "Network request failed".
 */
export const SSRF_BLOCKED_CODE = 'ESSRFBLOCKED';

/**
 * A URL safe to put in a log line or error message: origin and path only.
 * Download URLs are often signed (BFL result links carry the signature in the
 * query string), so the query becomes `?[redacted]` and the fragment and any
 * credentials are dropped. Unparseable input is not echoed.
 */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}${u.search ? '?[redacted]' : ''}`;
  } catch {
    return '[unparseable URL]';
  }
}

/**
 * An HTTP response the API returned that was not a success.
 *
 * `body` is the parsed response body when it was JSON, the raw text otherwise —
 * some endpoints answer a *poll* with 422 whose body is still a task result, and
 * that body has to survive to the caller.
 */
export class BflHttpError extends Error {
  readonly status: number;
  readonly retryAfter?: number;
  readonly body?: unknown;

  constructor(message: string, status: number, retryAfter?: number, body?: unknown) {
    super(message);
    this.name = 'BflHttpError';
    this.status = status;
    if (retryAfter !== undefined) this.retryAfter = retryAfter;
    if (body !== undefined) this.body = body;
  }
}

/**
 * A request that never produced a response: DNS failure, refused connection,
 * reset socket, TLS failure. `code` is the underlying cause's code where one
 * was available.
 */
export class BflNetworkError extends Error {
  readonly code?: string;
  /** Whether retrying could plausibly succeed. */
  readonly retryable: boolean;

  constructor(message: string, code?: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'BflNetworkError';
    if (code !== undefined) this.code = code;
    this.retryable = code !== undefined && RETRYABLE_NETWORK_CODES.has(code);
  }
}

/** The request exceeded its idle timeout. Always worth retrying. */
export class BflTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms without data`);
    this.name = 'BflTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  /** Body to send as JSON. */
  json?: Record<string, unknown> | null;
  /** Idle timeout in ms — reset whenever data arrives. */
  timeoutMs: number;
  /** Maximum redirects to follow (default 5). */
  maxRedirects?: number;
  /**
   * Called with each redirect target before it is followed. Throw to refuse.
   * This is where SSRF re-validation belongs — without it, following a redirect
   * discards whatever validation the original URL passed.
   */
  validateHop?: (url: string) => Promise<unknown> | unknown;
  /** Byte ceiling for the response body; exceeded => abort mid-stream. */
  maxBytes?: number;
  /**
   * undici dispatcher for this request and every redirect hop. Must come from
   * undici 7: an undici 8 `Agent` is rejected by Node 22's and 24's global
   * fetch (`UND_ERR_INVALID_ARG`) — see docs/DECISIONS.md #15.
   */
  dispatcher?: Dispatcher;
}

/** Parse a `Retry-After` header in delta-seconds form. */
function parseRetryAfter(headers: Headers): number | undefined {
  const raw = headers.get('retry-after');
  if (raw === null) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

/**
 * Dig the underlying error code out of a fetch failure. undici nests the real
 * cause one level down, and when several addresses were tried it is an
 * AggregateError whose `errors` hold the individual codes.
 */
/** The first Error in a `.cause` / `.errors` chain whose `.code` is `code`. */
function causeWithCode(cause: unknown, code: string): Error | undefined {
  if (!cause || typeof cause !== 'object') return undefined;
  const c = cause as { code?: unknown; errors?: unknown[]; cause?: unknown };
  if (c.code === code && cause instanceof Error) return cause;
  if (Array.isArray(c.errors)) {
    for (const nested of c.errors) {
      const found = causeWithCode(nested, code);
      if (found) return found;
    }
  }
  return causeWithCode(c.cause, code);
}

function causeCode(cause: unknown): string | undefined {
  if (!cause || typeof cause !== 'object') return undefined;
  const c = cause as { code?: string; errors?: unknown[]; cause?: unknown };
  if (typeof c.code === 'string') return c.code;
  if (Array.isArray(c.errors)) {
    for (const nested of c.errors) {
      const code = causeCode(nested);
      if (code) return code;
    }
  }
  if (c.cause) return causeCode(c.cause);
  return undefined;
}

/** Turn a thrown fetch/abort failure into one of our typed errors. */
function asTypedError(error: unknown, timeoutMs: number, timedOut: boolean): Error {
  if (timedOut) return new BflTimeoutError(timeoutMs);
  if (error instanceof BflHttpError || error instanceof BflNetworkError) return error;

  const err = error as { name?: string; message?: string; cause?: unknown };
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return new BflTimeoutError(timeoutMs);
  }
  // undici surfaces transport failures as TypeError('fetch failed') with the
  // real cause attached; the message itself carries nothing usable.
  const refusal = causeWithCode(err?.cause, SSRF_BLOCKED_CODE);
  if (refusal) return refusal;
  const code = causeCode(err?.cause);
  return new BflNetworkError(
    code ? `Network request failed (${code})` : `Network request failed: ${err?.message ?? 'unknown'}`,
    code,
    error
  );
}

/**
 * Read a body with a hard byte ceiling, aborting as soon as it is exceeded
 * rather than after the fact. Resets the idle timer on every chunk.
 */
async function readCapped(
  response: Response,
  maxBytes: number | undefined,
  resetIdle: () => void
): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      resetIdle();
      total += value.byteLength;
      if (maxBytes !== undefined && total > maxBytes) {
        // cancel() through the reader — the stream is locked while we hold it.
        await reader.cancel();
        throw new Error(`Response exceeds maximum size of ${maxBytes / (1024 * 1024)}MB`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, total);
}

/**
 * Perform one request, following redirects manually so each hop can be
 * validated, and return the final response plus its body as bytes.
 *
 * @throws BflHttpError on a non-2xx response
 * @throws BflNetworkError when no response was produced
 * @throws BflTimeoutError when the idle timeout elapsed
 */
export async function request(
  url: string,
  options: RequestOptions
): Promise<{ status: number; headers: Headers; bytes: Buffer; url: string }> {
  const { method = 'GET', headers = {}, json, timeoutMs, maxRedirects = 5, validateHop, maxBytes, dispatcher } =
    options;

  const controller = new AbortController();
  let timedOut = false;
  let timer: NodeJS.Timeout | undefined;
  const resetIdle = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  };

  try {
    resetIdle();

    let currentUrl = url;
    let currentMethod = method;
    let body: string | undefined =
      json !== undefined && json !== null ? JSON.stringify(json) : undefined;
    let hops = 0;

    for (;;) {
      const init: RequestInit = {
        method: currentMethod,
        headers,
        body,
        redirect: 'manual',
        signal: controller.signal,
      };
      // @types/node types fetch against its own bundled copy of undici's types
      // (undici-types), and npm undici ships a second copy at its own version;
      // the two Dispatcher declarations differ structurally (compose overloads)
      // while the runtime contract is the same. The http.test.ts dispatcher
      // test is the evidence for the pairing; this is the one place the copies meet.
      if (dispatcher) (init as { dispatcher?: unknown }).dispatcher = dispatcher;
      const response = await fetch(currentUrl, init);
      resetIdle();

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get('location');
        if (!location) break; // a redirect status with no target: treat as final
        if (hops >= maxRedirects) {
          throw new BflHttpError(
            `Too many redirects (limit ${maxRedirects}) starting from ${redactUrl(url)}`,
            response.status
          );
        }
        hops += 1;
        const next = new URL(location, currentUrl).toString();
        // Re-validate before following. Skipping this is the SSRF hole axios had.
        if (validateHop) await validateHop(next);
        // 303, and 301/302 on POST, become GET without a body — matching
        // long-standing agent behaviour. 307/308 preserve method and body.
        if (response.status === 303 || (currentMethod === 'POST' && response.status !== 307 && response.status !== 308)) {
          currentMethod = 'GET';
          body = undefined;
        }
        currentUrl = next;
        // Drain so the socket can be reused.
        await response.body?.cancel();
        continue;
      }

      const bytes = await readCapped(response, maxBytes, resetIdle);

      if (!response.ok) {
        const text = bytes.toString('utf8');
        let parsed: unknown = text;
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          /* not JSON — keep the raw text */
        }
        throw new BflHttpError(
          `Request failed with status code ${response.status}`,
          response.status,
          parseRetryAfter(response.headers),
          parsed
        );
      }

      return { status: response.status, headers: response.headers, bytes, url: currentUrl };
    }

    throw new BflNetworkError('Redirect response carried no Location header');
  } catch (error) {
    throw asTypedError(error, timeoutMs, timedOut);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Request a JSON endpoint.
 *
 * @throws BflHttpError / BflNetworkError / BflTimeoutError as `request`
 */
export async function requestJson<T>(url: string, options: RequestOptions): Promise<T> {
  const { bytes } = await request(url, options);
  const text = bytes.toString('utf8');
  if (text.length === 0) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new BflNetworkError(`Expected JSON from ${redactUrl(url)} but received ${text.slice(0, 120)}`);
  }
}

/**
 * Request binary content (images, video) with a hard size ceiling.
 */
export async function requestBytes(url: string, options: RequestOptions): Promise<Buffer> {
  const { bytes } = await request(url, options);
  return bytes;
}
