/**
 * BFL Service Utility Functions
 *
 * Utility functions for BFL image generation, including file I/O,
 * image handling, polling, and data transformations.
 */

import fs from 'fs/promises';
import { statSync } from 'fs';
import path from 'path';
import winston from 'winston';
import { requestBytes, SSRF_BLOCKED_CODE, redactUrl } from './http.js';
import { lookup } from 'dns/promises';
import { lookup as lookupCallback } from 'dns';
import type { LookupAddress, LookupAllOptions } from 'dns';
import { isIPv4, isIPv6 } from 'net';
import type { LookupFunction } from 'net';
import { Agent } from 'undici';
import type { Dispatcher } from 'undici';
import type {
  SpinnerObject,
  ImageValidationConstraints,
  ImageFileValidationResult,
  FileFormat,
} from './types/index.js';

// Configure module logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} - ${level.toUpperCase()} - ${message}`;
    })
  ),
  transports: [new winston.transports.Console()],
});

/** Deadline for the DNS lookup in validateImageUrl. */
const DNS_TIMEOUT_MS = 10_000;

/** Reject if `promise` has not settled within `ms`. */
async function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** A caught value as an Error (ported from stability-ai-api, kept private here). */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/** A caught value's Node error code, if it has one. */
function errorCode(value: unknown): string | undefined {
  if (typeof value === 'object' && value !== null && 'code' in value && typeof value.code === 'string') {
    return value.code;
  }
  return undefined;
}

/**
 * Expand an IPv6 address to its 8 hextets (numbers), accepting a trailing
 * dotted-quad. Returns null if it is not a well-formed IPv6 literal.
 */
function expandIPv6(ip: string): number[] | null {
  if (!isIPv6(ip)) return null;
  let text = ip;
  const dotted = text.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number);
    text = text.slice(0, dotted.index) + ((a << 8) | b).toString(16) + ':' + ((c << 8) | d).toString(16);
  }
  const [head, tail] = text.split('::');
  const parse = (part: string | undefined) => (part ? part.split(':').map(h => parseInt(h, 16)) : []);
  const left = parse(head);
  const right = parse(tail);
  const fill = tail === undefined ? [] : new Array(8 - left.length - right.length).fill(0);
  const hextets = [...left, ...fill, ...right];
  return hextets.length === 8 ? hextets : null;
}

/**
 * The IPv4 address an IPv6 address embeds and routes to, if any: IPv4-mapped
 * (::ffff:0:0/96), IPv4-translated (::ffff:0:0:0/96), NAT64 (64:ff9b::/96),
 * the deprecated IPv4-compatible form (::/96, excluding :: and ::1), and the
 * two tunnel forms — 6to4 (2002::/16, IPv4 in hextets 1-2) and Teredo
 * (2001::/32, the client IPv4 bit-inverted in the last 32 bits) — and
 * ISATAP (interface identifier 0:5efe or 200:5efe under any prefix, IPv4 in
 * the last 32 bits; added with the re-review). The tunnel
 * forms were added in 2.0.2 after the security-analyst review; a relay
 * delivers them to the embedded IPv4, so they are judged by it.
 *
 * Until 2.0.2 only the *dotted* mapped form was recognised. Node's URL parser
 * normalises https://[::ffff:127.0.0.1] to [::ffff:7f00:1], so the hex form —
 * the one validateImageUrl actually sees after parsing — bypassed the check.
 */
function embeddedIPv4(ip: string): string | null {
  const h = expandIPv6(ip);
  if (!h) return null;
  const zero = (from: number, to: number) => h.slice(from, to).every(x => x === 0);
  const isMapped = zero(0, 5) && h[5] === 0xffff;
  const isTranslated = zero(0, 4) && h[4] === 0xffff && h[5] === 0;
  const isNat64 = h[0] === 0x64 && h[1] === 0xff9b && zero(2, 6);
  const isCompatible = zero(0, 6) && (h[6] !== 0 || h[7] > 1);
  const quad = (hi: number, lo: number) => [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.');
  if (h[0] === 0x2002) return quad(h[1], h[2]); // 6to4
  if (h[0] === 0x2001 && h[1] === 0) return quad(h[6] ^ 0xffff, h[7] ^ 0xffff); // Teredo client
  if ((h[4] === 0 || h[4] === 0x200) && h[5] === 0x5efe) return quad(h[6], h[7]); // ISATAP, any prefix
  if (!(isMapped || isTranslated || isNat64 || isCompatible)) return null;
  return [h[6] >> 8, h[6] & 0xff, h[7] >> 8, h[7] & 0xff].join('.');
}

/**
 * Check if an IP address is blocked (private, localhost, or cloud metadata).
 * Used for DNS rebinding prevention.
 *
 * @param ip - IP address to check
 * @returns True if IP is blocked
 */
function isBlockedIP(ip: string): boolean {
  const cleanIP = ip.replace(/^\[|\]$/g, '').toLowerCase(); // Remove IPv6 brackets

  // An IPv6 address that embeds an IPv4 one is judged by that IPv4 — in any
  // spelling (dotted or hex), and whether it came from a URL or from DNS.
  const v4 = embeddedIPv4(cleanIP);
  if (v4) {
    return isBlockedIP(v4);
  }

  // Block localhost variations
  if (cleanIP === 'localhost' || cleanIP === '127.0.0.1' || cleanIP === '::1') {
    return true;
  }

  // Block cloud metadata endpoints
  const blockedHosts = [
    'metadata.google.internal',
    'metadata',
    '169.254.169.254',
  ];
  if (blockedHosts.includes(cleanIP)) {
    return true;
  }

  // Block private IP ranges and special addresses
  const blockedPatterns = [
    /^127\./,                    // Loopback
    /^10\./,                     // Private Class A
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private Class B
    /^192\.168\./,               // Private Class C
    /^169\.254\./,               // Link-local (AWS metadata)
    /^0\./,                      // "This network" (0.0.0.0/8)
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // Carrier-grade NAT (100.64.0.0/10)
    /^192\.0\.0\./,              // IETF protocol assignments (192.0.0.0/24)
    /^198\.1[89]\./,             // Benchmarking (198.18.0.0/15)
    /^(22[4-9]|2[3-5]\d)\./,      // Multicast and reserved (224.0.0.0/3)
    /^ff[0-9a-f]{2}:/,           // IPv6 multicast (ff00::/8)
    /^::1?$/,                    // IPv6 loopback / unspecified
    // fe80::/10 and fc00::/7 are prefix *ranges*, not literals. Until 2.0.2 these
    // were /^fe80:/, /^fc00:/, /^fd00:/, which passed fd12:3456::1 and every
    // other ULA address. A first hextet with fewer than four digits has
    // implied leading zeros (fd1:: is 0x0fd1), so exactly four are required.
    /^fe[89ab][0-9a-f]:/,        // IPv6 link-local (fe80::/10)
    /^f[cd][0-9a-f]{2}:/,        // IPv6 unique local (fc00::/7)
    /^fe[c-f][0-9a-f]:/,         // IPv6 site-local, deprecated but routable if configured (fec0::/10)
  ];

  return blockedPatterns.some(pattern => pattern.test(cleanIP));
}

/**
 * Validate image URL for security.
 * Enforces HTTPS and blocks private IPs, localhost, and cloud metadata endpoints.
 * Resolves domain names and checks every answer. This is the check-time half:
 * downloads also connect through `createGuardedLookup`, which re-checks the
 * addresses actually connected to — that, not this, is what stops DNS rebinding.
 *
 * @param url - URL to validate
 * @returns Validated URL
 * @throws Error if URL is invalid or insecure
 */
export async function validateImageUrl(url: string): Promise<string> {
  // First check for IPv4-mapped IPv6 in the original URL string (before URL parsing normalizes it)
  // This prevents SSRF bypass via https://[::ffff:127.0.0.1] or https://[::ffff:169.254.169.254]
  const ipv6MappedMatch = url.match(/\[::ffff:(\d+\.\d+\.\d+\.\d+)\]/i);
  if (ipv6MappedMatch) {
    const extractedIPv4 = ipv6MappedMatch[1];
    logger.warn(`SECURITY: Detected IPv4-mapped IPv6 address in URL: ${redactUrl(url)} → ${extractedIPv4}`);

    // Validate the extracted IPv4 directly
    if (extractedIPv4 === '127.0.0.1' || extractedIPv4.startsWith('127.')) {
      logger.warn(`SECURITY: Blocked IPv4-mapped IPv6 localhost: ${redactUrl(url)}`);
      throw new Error('Access to localhost is not allowed');
    }

    // Check against private IP patterns
    const privatePatterns = [
      /^10\./,                     // Private Class A
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private Class B
      /^192\.168\./,               // Private Class C
      /^169\.254\./,               // Link-local (AWS metadata)
      /^0\./,                      // Invalid range
    ];

    if (privatePatterns.some(pattern => pattern.test(extractedIPv4))) {
      logger.warn(`SECURITY: Blocked IPv4-mapped IPv6 private IP: ${redactUrl(url)}`);
      throw new Error('Access to internal/private IP addresses is not allowed');
    }
  }

  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch (error) {
    throw new Error(`Invalid URL: ${redactUrl(url)}`, { cause: error });
  }

  // Only allow HTTPS (not HTTP)
  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS URLs are allowed for security reasons');
  }

  const hostname = parsed.hostname.toLowerCase();
  const cleanHostname = hostname.replace(/^\[|\]$/g, ''); // Remove IPv6 brackets

  // First check if hostname itself is blocked (before DNS resolution)
  const blockedHosts = ['localhost', 'metadata.google.internal', 'metadata'];
  if (blockedHosts.includes(cleanHostname)) {
    logger.warn(`SECURITY: Blocked access to prohibited hostname: ${hostname}`);
    throw new Error('Access to cloud metadata endpoints is not allowed');
  }

  // Check if hostname is already an IP address (not a domain name)
  if (isIPv4(cleanHostname) || isIPv6(cleanHostname)) {
    // Direct IP address - validate it using our blocklist
    if (isBlockedIP(cleanHostname)) {
      logger.warn(`SECURITY: Blocked access to private/internal IP: ${hostname}`);
      throw new Error('Access to internal/private IP addresses is not allowed');
    }
  } else {
    // Hostname is a domain name: resolve and check it now, for an early and
    // readable refusal. The connect-time guard re-checks what is connected to.
    // Only the lookup sits inside the try: until 2.0.2 the blocked-address check
    // did too, and the catch told its own error apart from a DNS failure by
    // matching the message text 'resolves to internal'.
    logger.debug(`Resolving DNS for hostname: ${hostname}`);
    let addresses: { address: string }[];
    try {
      // Every address, not the first: a name with one public and one private
      // record passed a first-address check, and the client may connect to
      // either.
      // Bounded: the OS resolver has no deadline of its own, and this runs
      // before request()'s idle timer starts.
      addresses = await withTimeout(lookup(hostname, { all: true }), DNS_TIMEOUT_MS, `DNS lookup for ${hostname}`);
    } catch (error) {
      if (errorCode(error) === 'ENOTFOUND') {
        logger.warn(`SECURITY: Domain ${hostname} could not be resolved`);
        throw new Error(`Domain ${hostname} could not be resolved`, { cause: error });
      }
      const err = toError(error);
      logger.warn(`SECURITY: DNS lookup failed for ${hostname}: ${err.message}`);
      throw new Error(`Failed to validate domain ${hostname}: ${err.message}`, { cause: error });
    }
    logger.debug(`DNS resolved ${hostname} → ${addresses.map(a => a.address).join(', ')}`);

    const blocked = addresses.find(a => isBlockedIP(a.address));
    if (blocked) {
      logger.warn(`SECURITY: DNS resolution of ${hostname} points to blocked IP: ${blocked.address}`);
      throw new Error(`Domain ${hostname} resolves to internal/private IP address`);
    }

    logger.debug(`DNS validation passed for ${hostname}`);
  }

  return url;
}

/**
 * A parameter value as recorded in the CLI's dry-run log line and metadata
 * `parameters`: a URL with its query redacted (an *input* URL's signature has
 * no use in a record, and the dry-run line is a log line), a long non-URL
 * string (a base64 input) elided, arrays element-wise. The *result* URL the
 * metadata keeps for re-download is written separately and is not passed
 * through this (docs/DECISIONS.md #17).
 */
export function recordSafeValue(v: unknown): unknown {
  if (typeof v === 'string') {
    if (/^https?:\/\//i.test(v)) return redactUrl(v);
    if (v.length > 120) return `<base64 ${v.length} chars>`;
    return v;
  }
  if (Array.isArray(v)) return v.map(recordSafeValue);
  return v;
}

/** A resolver with `dns.lookup`'s `{ all: true }` shape; injectable for tests. */
export type AllAddressResolver = (
  hostname: string,
  options: LookupAllOptions,
  callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void
) => void;

/**
 * Build a connect-time `lookup` for an undici `Agent` that refuses to connect
 * when any resolved address is blocked (private, loopback, link-local,
 * metadata — the `validateImageUrl` blocklist).
 *
 * This is what closes DNS rebinding. `validateImageUrl` resolves the name and
 * checks the answers, then fetch resolves it again to connect; a name whose
 * record changes between the two (low TTL, attacker-run DNS) passed the first
 * and connected to the second. Here the addresses that are checked are the
 * addresses the socket is given, so there is no second resolution to race.
 * `validateImageUrl` still runs first: it covers IP literals (which undici
 * connects to without a lookup) and gives an early, readable refusal.
 *
 * The refusal is an Error with `.code === 'ESSRFBLOCKED'`; `request()` rethrows
 * it as is rather than as a generic network error.
 *
 * @param resolve - Resolver to wrap (default `dns.lookup`)
 * @param isBlocked - Address predicate (default: the SSRF blocklist)
 * @returns A `lookup` for `new Agent({ connect: { lookup } })`
 */
export function createGuardedLookup(
  resolve: AllAddressResolver = lookupCallback,
  isBlocked: (ip: string) => boolean = isBlockedIP
): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname, { family: options.family, hints: options.hints, all: true }, (err, addresses) => {
      if (err) {
        callback(err, '');
        return;
      }
      const blocked = addresses.find(a => isBlocked(a.address));
      if (blocked || addresses.length === 0) {
        const refusal: NodeJS.ErrnoException = new Error(
          blocked
            ? `Domain ${hostname} resolves to internal/private IP address`
            : `Domain ${hostname} resolved to no addresses`
        );
        refusal.code = SSRF_BLOCKED_CODE;
        if (blocked) logger.warn(`SECURITY: connect-time lookup of ${hostname} returned blocked IP: ${blocked.address}`);
        callback(refusal, '');
        return;
      }
      if (options.all) {
        callback(null, addresses);
      } else {
        callback(null, addresses[0].address, addresses[0].family);
      }
    });
  };
}

/**
 * The dispatcher every URL download goes through (images and video). Created on first use, not at
 * import: the library has no import-time side effects (no import-time side effects).
 * undici must stay on major 7 — see docs/DECISIONS.md #15.
 */
let downloadDispatcher: Dispatcher | undefined;
function getDownloadDispatcher(): Dispatcher {
  downloadDispatcher ??= new Agent({ connect: { lookup: createGuardedLookup() } });
  return downloadDispatcher;
}

/**
 * Validate image file path.
 * Checks file exists, is readable, and has valid image magic bytes.
 *
 * @param filepath - Path to image file
 * @returns Validated filepath
 * @throws Error if file doesn't exist, isn't readable, or isn't a valid image
 */
export async function validateImagePath(filepath: string): Promise<string> {
  try {
    const buffer = await fs.readFile(filepath);

    // Check file size (must be > 0)
    if (buffer.length === 0) {
      throw new Error(`Image file is empty: ${filepath}`);
    }

    // Check magic bytes for common image formats
    const magicBytes = buffer.slice(0, 4);
    const isPNG =
      magicBytes[0] === 0x89 &&
      magicBytes[1] === 0x50 &&
      magicBytes[2] === 0x4e &&
      magicBytes[3] === 0x47;
    const isJPEG = magicBytes[0] === 0xff && magicBytes[1] === 0xd8 && magicBytes[2] === 0xff;
    const isWebP = buffer.slice(8, 12).toString() === 'WEBP';
    const isGIF = magicBytes.slice(0, 3).toString() === 'GIF';

    if (!isPNG && !isJPEG && !isWebP && !isGIF) {
      throw new Error(
        `File does not appear to be a valid image (PNG, JPEG, WebP, or GIF): ${filepath}`
      );
    }

    return filepath;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw new Error(`Image file not found: ${filepath}`);
    } else if (err.code === 'EACCES') {
      throw new Error(`Permission denied reading image file: ${filepath}`);
    }
    throw error;
  }
}

/** Server-side ceiling for uploaded video (video-edit: 50 MiB; upscale: 50 MB). */
export const MAX_VIDEO_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * Validate video file path.
 * Checks file exists, is non-empty, is within the API's upload ceiling, and
 * carries an ISO BMFF (`ftyp`) header — i.e. MP4/MOV — which is what every
 * video endpoint accepts.
 *
 * @param filepath - Path to video file
 * @returns Validated filepath
 * @throws Error if file doesn't exist, isn't readable, is too large, or isn't MP4
 */
export async function validateVideoPath(filepath: string): Promise<string> {
  try {
    const stats = await fs.stat(filepath);
    if (stats.size === 0) {
      throw new Error(`Video file is empty: ${filepath}`);
    }
    if (stats.size > MAX_VIDEO_UPLOAD_BYTES) {
      const mb = (stats.size / (1024 * 1024)).toFixed(1);
      throw new Error(`Video file is ${mb}MB; the API accepts at most 50MB: ${filepath}`);
    }

    const handle = await fs.open(filepath, 'r');
    try {
      const header = Buffer.alloc(12);
      await handle.read(header, 0, 12, 0);
      // ISO BMFF: bytes 4-7 are 'ftyp'
      if (header.slice(4, 8).toString() !== 'ftyp') {
        throw new Error(`File does not appear to be an MP4 video: ${filepath}`);
      }
    } finally {
      await handle.close();
    }

    return filepath;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw new Error(`Video file not found: ${filepath}`);
    } else if (err.code === 'EACCES') {
      throw new Error(`Permission denied reading video file: ${filepath}`);
    }
    throw error;
  }
}

/**
 * Validate image file against constraints.
 * Checks file size and format.
 *
 * @param filepath - Path to image file
 * @param constraints - Validation constraints
 * @returns Validation result { valid: boolean, errors: string[] }
 */
export async function validateImageFile(
  filepath: string,
  constraints: ImageValidationConstraints = {}
): Promise<ImageFileValidationResult> {
  const errors: string[] = [];

  try {
    // Check if file exists
    const stats = statSync(filepath);

    // Check file size
    if (constraints.maxSize && stats.size > constraints.maxSize) {
      const maxMB = (constraints.maxSize / (1024 * 1024)).toFixed(1);
      const actualMB = (stats.size / (1024 * 1024)).toFixed(1);
      errors.push(`Image file size (${actualMB}MB) exceeds maximum (${maxMB}MB)`);
    }

    // Check file extension
    const ext = path.extname(filepath).toLowerCase().substring(1);
    if (constraints.formats && !constraints.formats.includes(ext)) {
      errors.push(
        `Image format "${ext}" not supported. Valid formats: ${constraints.formats.join(', ')}`
      );
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      errors.push(`Image file not found: ${filepath}`);
    } else {
      errors.push(`Error validating image file: ${err.message}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Ensure a directory exists, creating it if necessary.
 *
 * @param dirPath - Directory path to ensure
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    const err = error as Error;
    logger.error(`Error creating directory ${dirPath}: ${err.message}`);
    throw error;
  }
}

/**
 * Write data to file.
 *
 * @param data - Data to write (Object, Array, Buffer, string, etc.)
 * @param filepath - Path where file should be written
 * @param fileFormat - Format to use ('json', 'txt', 'binary', 'auto')
 *
 * @throws Error if filepath not provided
 */
export async function writeToFile(
  data: unknown,
  filepath: string,
  fileFormat: FileFormat = 'auto'
): Promise<void> {
  if (!filepath) {
    throw new Error('Filepath is required');
  }

  try {
    // Create directory if it doesn't exist
    const dir = path.dirname(filepath);
    await ensureDirectory(dir);

    // Auto-detect format from extension
    let format = fileFormat;
    if (format === 'auto') {
      const ext = path.extname(filepath).toLowerCase();
      if (ext === '.json') {
        format = 'json';
      } else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
        format = 'binary';
      } else {
        format = 'txt';
      }
    }

    // Write based on format
    if (format === 'json') {
      await fs.writeFile(filepath, JSON.stringify(data, null, 2));
    } else if (format === 'binary') {
      // For Buffer or binary data
      await fs.writeFile(filepath, data as Buffer);
    } else {
      // Text format
      await fs.writeFile(filepath, String(data));
    }

    logger.debug(`Successfully wrote data to ${filepath}`);
  } catch (error) {
    const err = error as Error;
    logger.error(`Error writing to file ${filepath}: ${err.message}`);
    throw error;
  }
}

/**
 * Read data from file.
 *
 * @param filepath - Path to file to read
 * @param fileFormat - Format to use ('json', 'txt', 'binary', 'auto')
 * @returns Data from file
 *
 * @throws Error if filepath not provided or file doesn't exist
 */
export async function readFromFile(
  filepath: string,
  fileFormat: FileFormat = 'auto'
): Promise<unknown> {
  if (!filepath) {
    throw new Error('Filepath is required');
  }

  try {
    // Check if file exists
    await fs.access(filepath);

    // Auto-detect format from extension
    let format = fileFormat;
    if (format === 'auto') {
      const ext = path.extname(filepath).toLowerCase();
      if (ext === '.json') {
        format = 'json';
      } else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
        format = 'binary';
      } else {
        format = 'txt';
      }
    }

    let result: unknown;

    // Read based on format
    if (format === 'json') {
      const content = await fs.readFile(filepath, 'utf-8');
      result = JSON.parse(content);
    } else if (format === 'binary') {
      result = await fs.readFile(filepath);
    } else {
      result = await fs.readFile(filepath, 'utf-8');
    }

    logger.debug(`Successfully read data from ${filepath}`);
    return result;
  } catch (error) {
    const err = error as Error;
    logger.error(`Error reading from file ${filepath}: ${err.message}`);
    throw error;
  }
}

/**
 * Convert a local image file to base64 string.
 *
 * @param filepath - Path to local image file
 * @returns Base64-encoded image string
 *
 * @throws Error if file doesn't exist or can't be read
 */
export async function fileToBase64(filepath: string): Promise<string> {
  try {
    const buffer = await fs.readFile(filepath);
    const base64 = buffer.toString('base64');
    logger.debug(`Converted ${filepath} to base64 (${base64.length} chars)`);
    return base64;
  } catch (error) {
    const err = error as Error;
    logger.error(`Error converting file to base64: ${err.message}`);
    throw new Error(`Failed to read image file '${filepath}': ${err.message}`);
  }
}

/**
 * Download image from URL to base64 string.
 *
 * @param url - Image URL
 * @returns Base64-encoded image string
 *
 * @throws Error if URL can't be fetched or exceeds size limit
 */
export async function urlToBase64(url: string): Promise<string> {
  try {
    // Validate the URL itself, not just redirect targets. This is an exported
    // function, so it can be called directly without going through
    // imageToBase64 — without this, that path skipped SSRF validation entirely.
    await validateImageUrl(url);

    const MAX_SIZE = 50 * 1024 * 1024; // 50MB limit

    const data = await requestBytes(url, {
      timeoutMs: 60000, // 60 second idle timeout for large files
      maxRedirects: 5,
      // Re-validate every redirect target. Without this a URL that passes the
      // SSRF check can 302 to an internal address and the body comes back
      // anyway — which is exactly what happened under axios.
      validateHop: validateImageUrl,
      dispatcher: getDownloadDispatcher(),
      maxBytes: MAX_SIZE, // enforced while streaming, not after buffering
    });

    const base64 = data.toString('base64');
    logger.debug(`Downloaded and converted ${redactUrl(url)} to base64 (${base64.length} chars, ${data.byteLength} bytes)`);
    return base64;
  } catch (error) {
    const err = error as Error;
    logger.error(`Error downloading image from URL: ${err.message}`);
    throw new Error(`Failed to download image from '${redactUrl(url)}': ${err.message}`);
  }
}

/**
 * Convert image input (file path or URL) to base64 string.
 * Validates URL/file path before conversion for security.
 *
 * @param input - Local file path or URL
 * @returns Base64-encoded image string
 * @throws Error if validation fails or conversion fails
 */
export async function imageToBase64(input: string): Promise<string> {
  // Check if input is a URL
  if (input.startsWith('http://') || input.startsWith('https://')) {
    // Validate URL for security (SSRF protection)
    await validateImageUrl(input);
    return await urlToBase64(input);
  } else {
    // Validate file path (existence and format)
    await validateImagePath(input);
    return await fileToBase64(input);
  }
}

/**
 * Prepare a video input for the API.
 * A local file is validated and base64-encoded. An HTTP(S) URL is validated
 * for SSRF and returned as-is: every video endpoint accepts URLs directly, and
 * re-embedding a 50MB clip as base64 would only inflate the request.
 *
 * @param input - File path or HTTP(S) URL
 * @returns Base64 string (local file) or the URL (remote)
 */
export async function videoToBase64(input: string): Promise<string> {
  if (input.startsWith('http://') || input.startsWith('https://')) {
    await validateImageUrl(input);
    return input;
  }
  await validateVideoPath(input);
  return await fileToBase64(input);
}

/** Download ceiling per media kind. Images are ~MBs; a 20s UHD clip can be far larger. */
export const MAX_DOWNLOAD_BYTES = {
  image: 50 * 1024 * 1024,
  video: 500 * 1024 * 1024,
} as const;

/**
 * Download media from URL and save to file.
 *
 * @param url - Media URL (signed BFL result URL)
 * @param filepath - Destination path
 * @param options.maxSize - Byte ceiling (default: image limit)
 *
 * @throws Error if download fails, URL is unsafe, or the body exceeds maxSize
 */
export async function downloadMedia(
  url: string,
  filepath: string,
  { maxSize = MAX_DOWNLOAD_BYTES.image }: { maxSize?: number } = {}
): Promise<void> {
  try {
    // Validate URL for security (SSRF protection)
    await validateImageUrl(url);

    const dir = path.dirname(filepath);
    await ensureDirectory(dir);

    const data = await requestBytes(url, {
      timeoutMs: 120000, // 2 minute idle timeout for large files
      maxRedirects: 5,
      validateHop: validateImageUrl, // see urlToBase64
      dispatcher: getDownloadDispatcher(),
      maxBytes: maxSize, // enforced while streaming, not after buffering
    });

    await fs.writeFile(filepath, data);
    logger.info(`Downloaded to ${filepath} (${data.byteLength} bytes)`);
  } catch (error) {
    const err = error as Error;
    logger.error(`Error downloading media: ${err.message}`);
    throw error;
  }
}

/**
 * Download image from URL and save to file (50MB ceiling).
 *
 * @param url - Image URL
 * @param filepath - Destination path
 */
export async function downloadImage(url: string, filepath: string): Promise<void> {
  return downloadMedia(url, filepath, { maxSize: MAX_DOWNLOAD_BYTES.image });
}

/**
 * Download video from URL and save to file (500MB ceiling).
 *
 * @param url - Video URL
 * @param filepath - Destination path
 */
export async function downloadVideo(url: string, filepath: string): Promise<void> {
  return downloadMedia(url, filepath, { maxSize: MAX_DOWNLOAD_BYTES.video });
}

/**
 * Pause execution for specified duration.
 *
 * @param seconds - Number of seconds to pause (can be float for sub-second delays)
 *
 * @throws Error if seconds is negative
 */
export function pause(seconds: number): Promise<void> {
  if (seconds < 0) {
    throw new Error('Seconds cannot be negative');
  }

  logger.debug(`Pausing for ${seconds} seconds...`);
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

/**
 * Generate random integer between min and max (inclusive).
 *
 * @param minVal - Minimum value
 * @param maxVal - Maximum value
 * @returns Random integer between minVal and maxVal
 *
 * @throws Error if minVal > maxVal
 */
export function randomNumber(minVal: number, maxVal: number): number {
  if (minVal > maxVal) {
    throw new Error(`minVal (${minVal}) cannot be greater than maxVal (${maxVal})`);
  }

  const result = Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal;
  logger.debug(`Generated random number: ${result} (range: ${minVal}-${maxVal})`);
  return result;
}

/**
 * Generate a safe filename from a prompt string.
 *
 * @param prompt - Prompt text
 * @param maxLength - Maximum filename length (default: 50)
 * @returns Safe filename string
 */
export function promptToFilename(prompt: string, maxLength = 50): string {
  // Remove special characters and replace spaces with underscores
  let filename = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_')
    .replace(/^_+|_+$/g, '');

  // Truncate if too long
  if (filename.length > maxLength) {
    filename = filename.substring(0, maxLength);
  }

  // If empty after sanitization, use default
  if (!filename) {
    filename = 'image';
  }

  return filename;
}

/**
 * Generate a timestamped filename.
 *
 * @param prefix - Filename prefix (e.g., prompt-based name)
 * @param extension - File extension (e.g., 'png', 'jpg')
 * @returns Timestamped filename
 */
export function generateTimestampedFilename(prefix: string, extension: string): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .split('Z')[0];
  return `${timestamp}_${prefix}.${extension}`;
}

/**
 * Create a spinner for long-running operations.
 * Returns an object with start() and stop() methods.
 *
 * @param message - Message to display with spinner
 * @returns Spinner object with start() and stop() methods
 */
export function createSpinner(message: string): SpinnerObject {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frameIndex = 0;
  let interval: ReturnType<typeof setInterval> | null = null;
  let currentMessage = message;

  return {
    start() {
      process.stdout.write('\n');
      interval = setInterval(() => {
        const frame = frames[frameIndex];
        process.stdout.write(`\r${frame} ${currentMessage}`);
        frameIndex = (frameIndex + 1) % frames.length;
      }, 80);
    },

    stop(finalMessage: string | null = null) {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      process.stdout.write('\r');
      if (finalMessage) {
        process.stdout.write(`${finalMessage}\n`);
      } else {
        process.stdout.write('\r\x1b[K'); // Clear line
      }
    },

    update(newMessage: string) {
      currentMessage = newMessage;
    },
  };
}

/**
 * Set logger level.
 *
 * @param level - Log level (debug, info, warn, error)
 */
export function setLogLevel(level: string): void {
  logger.level = level.toLowerCase();
}

/**
 * Shared winston logger used across the library and CLI. Level is controlled by
 * {@link setLogLevel}; pass `NONE` to silence it entirely.
 */
export { logger };
