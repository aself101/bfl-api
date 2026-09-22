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
import { requestBytes } from './http.js';
import { lookup } from 'dns/promises';
import { isIPv4, isIPv6 } from 'net';
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

/**
 * Check if an IP address is in a blocked range (private, loopback, or cloud metadata).
 *
 * @param ip - IP address to check
 * @returns True if IP is blocked
 */
function isBlockedIP(ip: string): boolean {
  const cleanIP = ip.replace(/^\[|\]$/g, ''); // Remove IPv6 brackets

  // Block localhost variations
  if (cleanIP === 'localhost' || cleanIP === '127.0.0.1' || cleanIP === '::1') {
    return true;
  }

  // Block cloud metadata endpoints
  const blockedHosts = ['metadata.google.internal', 'metadata', '169.254.169.254'];
  if (blockedHosts.includes(cleanIP)) {
    return true;
  }

  // Block private IP ranges and special addresses
  const blockedPatterns = [
    /^127\./, // Loopback
    /^10\./, // Private Class A
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private Class B
    /^192\.168\./, // Private Class C
    /^169\.254\./, // Link-local (AWS metadata)
    /^0\./, // Invalid range
    /^::1$/, // IPv6 loopback
    /^fe80:/, // IPv6 link-local
    /^fc00:/, // IPv6 unique local
    /^fd00:/, // IPv6 unique local
  ];

  return blockedPatterns.some((pattern) => pattern.test(cleanIP));
}

/**
 * Validate image URL for security.
 * Enforces HTTPS, blocks private IPs, localhost, and cloud metadata endpoints.
 * Performs DNS resolution to prevent DNS rebinding attacks.
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
    logger.warn(`SECURITY: Detected IPv4-mapped IPv6 address in URL: ${url} → ${extractedIPv4}`);

    // Validate the extracted IPv4 directly
    if (extractedIPv4 === '127.0.0.1' || extractedIPv4.startsWith('127.')) {
      logger.warn(`SECURITY: Blocked IPv4-mapped IPv6 localhost: ${url}`);
      throw new Error('Access to localhost is not allowed');
    }

    // Check against private IP patterns
    const privatePatterns = [
      /^10\./, // Private Class A
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private Class B
      /^192\.168\./, // Private Class C
      /^169\.254\./, // Link-local (AWS metadata)
      /^0\./, // Invalid range
    ];

    if (privatePatterns.some((pattern) => pattern.test(extractedIPv4))) {
      logger.warn(`SECURITY: Blocked IPv4-mapped IPv6 private IP: ${url}`);
      throw new Error('Access to internal/private IP addresses is not allowed');
    }
  }

  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  // Only allow HTTPS (not HTTP)
  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS URLs are allowed for security reasons');
  }

  const hostname = parsed.hostname.toLowerCase();
  const cleanHostname = hostname.replace(/^\[|\]$/g, ''); // Remove IPv6 brackets

  // First check if hostname itself is blocked (before DNS resolution)
  // This catches 'localhost', 'metadata.google.internal', 'metadata', etc.
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
    // Hostname is a domain name - perform DNS resolution to prevent DNS rebinding
    try {
      logger.debug(`Resolving DNS for hostname: ${hostname}`);
      const { address } = await lookup(hostname);
      logger.debug(`DNS resolved ${hostname} → ${address}`);

      // Validate the resolved IP address
      if (isBlockedIP(address)) {
        logger.warn(`SECURITY: DNS resolution of ${hostname} points to blocked IP: ${address}`);
        throw new Error(`Domain ${hostname} resolves to internal/private IP address`);
      }

      logger.debug(`DNS validation passed for ${hostname} (resolved to ${address})`);
    } catch (error) {
      const err = error as NodeJS.ErrnoException & { message?: string };
      if (err.code === 'ENOTFOUND') {
        logger.warn(`SECURITY: Domain ${hostname} could not be resolved`);
        throw new Error(`Domain ${hostname} could not be resolved`);
      } else if (err.message && err.message.includes('resolves to internal')) {
        // Re-throw our validation errors
        throw error;
      } else {
        logger.warn(`SECURITY: DNS lookup failed for ${hostname}: ${err.message}`);
        throw new Error(`Failed to validate domain ${hostname}: ${err.message}`);
      }
    }
  }

  return url;
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
      maxBytes: MAX_SIZE, // enforced while streaming, not after buffering
    });

    const base64 = data.toString('base64');
    logger.debug(`Downloaded and converted ${url} to base64 (${base64.length} chars, ${data.byteLength} bytes)`);
    return base64;
  } catch (error) {
    const err = error as Error;
    logger.error(`Error downloading image from URL: ${err.message}`);
    throw new Error(`Failed to download image from '${url}': ${err.message}`);
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
