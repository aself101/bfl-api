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
import axios from 'axios';
import { lookup } from 'dns/promises';
import { isIPv4, isIPv6 } from 'net';

// Configure module logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} - ${level.toUpperCase()} - ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console()
  ]
});

/**
 * Check if an IP address is in a blocked range (private, loopback, or cloud metadata).
 *
 * @param {string} ip - IP address to check
 * @returns {boolean} True if IP is blocked
 */
function isBlockedIP(ip) {
  const cleanIP = ip.replace(/^\[|\]$/g, ''); // Remove IPv6 brackets

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
    /^0\./,                      // Invalid range
    /^::1$/,                     // IPv6 loopback
    /^fe80:/,                    // IPv6 link-local
    /^fc00:/,                    // IPv6 unique local
    /^fd00:/,                    // IPv6 unique local
  ];

  return blockedPatterns.some(pattern => pattern.test(cleanIP));
}

/**
 * Validate image URL for security.
 * Enforces HTTPS, blocks private IPs, localhost, and cloud metadata endpoints.
 * Performs DNS resolution to prevent DNS rebinding attacks.
 *
 * @param {string} url - URL to validate
 * @returns {Promise<string>} Validated URL
 * @throws {Error} If URL is invalid or insecure
 */
export async function validateImageUrl(url) {
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
      /^10\./,                     // Private Class A
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private Class B
      /^192\.168\./,               // Private Class C
      /^169\.254\./,               // Link-local (AWS metadata)
      /^0\./,                      // Invalid range
    ];

    if (privatePatterns.some(pattern => pattern.test(extractedIPv4))) {
      logger.warn(`SECURITY: Blocked IPv4-mapped IPv6 private IP: ${url}`);
      throw new Error('Access to internal/private IP addresses is not allowed');
    }
  }

  let parsed;

  try {
    parsed = new URL(url);
  } catch (error) {
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
      if (error.code === 'ENOTFOUND') {
        logger.warn(`SECURITY: Domain ${hostname} could not be resolved`);
        throw new Error(`Domain ${hostname} could not be resolved`);
      } else if (error.message && error.message.includes('resolves to internal')) {
        // Re-throw our validation errors
        throw error;
      } else {
        logger.warn(`SECURITY: DNS lookup failed for ${hostname}: ${error.message}`);
        throw new Error(`Failed to validate domain ${hostname}: ${error.message}`);
      }
    }
  }

  return url;
}

/**
 * Validate image file path.
 * Checks file exists, is readable, and has valid image magic bytes.
 *
 * @param {string} filepath - Path to image file
 * @returns {Promise<string>} Validated filepath
 * @throws {Error} If file doesn't exist, isn't readable, or isn't a valid image
 */
export async function validateImagePath(filepath) {
  try {
    const buffer = await fs.readFile(filepath);

    // Check file size (must be > 0)
    if (buffer.length === 0) {
      throw new Error(`Image file is empty: ${filepath}`);
    }

    // Check magic bytes for common image formats
    const magicBytes = buffer.slice(0, 4);
    const isPNG = magicBytes[0] === 0x89 && magicBytes[1] === 0x50 && magicBytes[2] === 0x4E && magicBytes[3] === 0x47;
    const isJPEG = magicBytes[0] === 0xFF && magicBytes[1] === 0xD8 && magicBytes[2] === 0xFF;
    const isWebP = buffer.slice(8, 12).toString() === 'WEBP';
    const isGIF = magicBytes.slice(0, 3).toString() === 'GIF';

    if (!isPNG && !isJPEG && !isWebP && !isGIF) {
      throw new Error(`File does not appear to be a valid image (PNG, JPEG, WebP, or GIF): ${filepath}`);
    }

    return filepath;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Image file not found: ${filepath}`);
    } else if (error.code === 'EACCES') {
      throw new Error(`Permission denied reading image file: ${filepath}`);
    }
    throw error;
  }
}

/**
 * Validate image file against constraints.
 * Checks file size and format.
 *
 * @param {string} filepath - Path to image file
 * @param {Object} constraints - Validation constraints
 * @param {number} constraints.maxSize - Maximum file size in bytes
 * @param {string[]} constraints.formats - Allowed file formats (e.g., ['png', 'jpg', 'jpeg'])
 * @returns {Promise<Object>} Validation result { valid: boolean, errors: string[] }
 */
export async function validateImageFile(filepath, constraints = {}) {
  const errors = [];

  try {
    // Check if file exists
    const stats = statSync(filepath);

    // Check file size
    if (constraints.maxSize && stats.size > constraints.maxSize) {
      const maxMB = (constraints.maxSize / (1024 * 1024)).toFixed(1);
      const actualMB = (stats.size / (1024 * 1024)).toFixed(1);
      errors.push(
        `Image file size (${actualMB}MB) exceeds maximum (${maxMB}MB)`
      );
    }

    // Check file extension
    const ext = path.extname(filepath).toLowerCase().substring(1);
    if (constraints.formats && !constraints.formats.includes(ext)) {
      errors.push(
        `Image format "${ext}" not supported. Valid formats: ${constraints.formats.join(', ')}`
      );
    }

  } catch (error) {
    if (error.code === 'ENOENT') {
      errors.push(`Image file not found: ${filepath}`);
    } else {
      errors.push(`Error validating image file: ${error.message}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Ensure a directory exists, creating it if necessary.
 *
 * @param {string} dirPath - Directory path to ensure
 */
export async function ensureDirectory(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    logger.error(`Error creating directory ${dirPath}: ${error.message}`);
    throw error;
  }
}

/**
 * Write data to file.
 *
 * @param {any} data - Data to write (Object, Array, Buffer, string, etc.)
 * @param {string} filepath - Path where file should be written
 * @param {string} fileFormat - Format to use ('json', 'txt', 'binary', 'auto')
 *
 * @throws {Error} If filepath not provided
 */
export async function writeToFile(data, filepath, fileFormat = 'auto') {
  if (!filepath) {
    throw new Error('Filepath is required');
  }

  try {
    // Create directory if it doesn't exist
    const dir = path.dirname(filepath);
    await ensureDirectory(dir);

    // Auto-detect format from extension
    if (fileFormat === 'auto') {
      const ext = path.extname(filepath).toLowerCase();
      if (ext === '.json') {
        fileFormat = 'json';
      } else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
        fileFormat = 'binary';
      } else {
        fileFormat = 'txt';
      }
    }

    // Write based on format
    if (fileFormat === 'json') {
      await fs.writeFile(filepath, JSON.stringify(data, null, 2));
    } else if (fileFormat === 'binary') {
      // For Buffer or binary data
      await fs.writeFile(filepath, data);
    } else {
      // Text format
      await fs.writeFile(filepath, String(data));
    }

    logger.debug(`Successfully wrote data to ${filepath}`);
  } catch (error) {
    logger.error(`Error writing to file ${filepath}: ${error.message}`);
    throw error;
  }
}

/**
 * Read data from file.
 *
 * @param {string} filepath - Path to file to read
 * @param {string} fileFormat - Format to use ('json', 'txt', 'binary', 'auto')
 * @returns {Promise<any>} Data from file
 *
 * @throws {Error} If filepath not provided or file doesn't exist
 */
export async function readFromFile(filepath, fileFormat = 'auto') {
  if (!filepath) {
    throw new Error('Filepath is required');
  }

  try {
    // Check if file exists
    await fs.access(filepath);

    // Auto-detect format from extension
    if (fileFormat === 'auto') {
      const ext = path.extname(filepath).toLowerCase();
      if (ext === '.json') {
        fileFormat = 'json';
      } else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
        fileFormat = 'binary';
      } else {
        fileFormat = 'txt';
      }
    }

    let result;

    // Read based on format
    if (fileFormat === 'json') {
      const content = await fs.readFile(filepath, 'utf-8');
      result = JSON.parse(content);
    } else if (fileFormat === 'binary') {
      result = await fs.readFile(filepath);
    } else {
      result = await fs.readFile(filepath, 'utf-8');
    }

    logger.debug(`Successfully read data from ${filepath}`);
    return result;
  } catch (error) {
    logger.error(`Error reading from file ${filepath}: ${error.message}`);
    throw error;
  }
}

/**
 * Convert a local image file to base64 string.
 *
 * @param {string} filepath - Path to local image file
 * @returns {Promise<string>} Base64-encoded image string
 *
 * @throws {Error} If file doesn't exist or can't be read
 */
export async function fileToBase64(filepath) {
  try {
    const buffer = await fs.readFile(filepath);
    const base64 = buffer.toString('base64');
    logger.debug(`Converted ${filepath} to base64 (${base64.length} chars)`);
    return base64;
  } catch (error) {
    logger.error(`Error converting file to base64: ${error.message}`);
    throw new Error(`Failed to read image file '${filepath}': ${error.message}`);
  }
}

/**
 * Download image from URL to base64 string.
 *
 * @param {string} url - Image URL
 * @returns {Promise<string>} Base64-encoded image string
 *
 * @throws {Error} If URL can't be fetched or exceeds size limit
 */
export async function urlToBase64(url) {
  try {
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB limit

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 60000,              // 60 second timeout for large files
      maxRedirects: 5,             // Limit redirects
      maxContentLength: MAX_SIZE,  // Axios built-in size limit
      maxBodyLength: MAX_SIZE      // Axios built-in size limit
    });

    // Verify actual size (belt-and-suspenders approach)
    if (response.data.length > MAX_SIZE) {
      throw new Error(`Image exceeds maximum size of ${MAX_SIZE / (1024 * 1024)}MB`);
    }

    const base64 = Buffer.from(response.data).toString('base64');
    logger.debug(`Downloaded and converted ${url} to base64 (${base64.length} chars, ${response.data.length} bytes)`);
    return base64;
  } catch (error) {
    logger.error(`Error downloading image from URL: ${error.message}`);
    throw new Error(`Failed to download image from '${url}': ${error.message}`);
  }
}

/**
 * Convert image input (file path or URL) to base64 string.
 * Validates URL/file path before conversion for security.
 *
 * @param {string} input - Local file path or URL
 * @returns {Promise<string>} Base64-encoded image string
 * @throws {Error} If validation fails or conversion fails
 */
export async function imageToBase64(input) {
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
 * Download image from URL and save to file.
 *
 * @param {string} url - Image URL
 * @param {string} filepath - Destination file path
 * @returns {Promise<void>}
 */
export async function downloadImage(url, filepath) {
  try {
    // Validate URL for security (SSRF protection)
    await validateImageUrl(url);

    const dir = path.dirname(filepath);
    await ensureDirectory(dir);

    const MAX_SIZE = 50 * 1024 * 1024; // 50MB limit

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 60000,              // 60 second timeout for large files
      maxRedirects: 5,             // Limit redirects
      maxContentLength: MAX_SIZE,  // Axios built-in size limit
      maxBodyLength: MAX_SIZE      // Axios built-in size limit
    });

    // Verify actual size
    if (response.data.length > MAX_SIZE) {
      throw new Error(`Image exceeds maximum size of ${MAX_SIZE / (1024 * 1024)}MB`);
    }

    await fs.writeFile(filepath, Buffer.from(response.data));
    logger.info(`Downloaded image to ${filepath} (${response.data.length} bytes)`);
  } catch (error) {
    logger.error(`Error downloading image: ${error.message}`);
    throw error;
  }
}

/**
 * Pause execution for specified duration.
 *
 * @param {number} seconds - Number of seconds to pause (can be float for sub-second delays)
 * @returns {Promise<void>}
 *
 * @throws {Error} If seconds is negative
 */
export function pause(seconds) {
  if (seconds < 0) {
    throw new Error('Seconds cannot be negative');
  }

  logger.debug(`Pausing for ${seconds} seconds...`);
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

/**
 * Generate random integer between min and max (inclusive).
 *
 * @param {number} minVal - Minimum value
 * @param {number} maxVal - Maximum value
 * @returns {number} Random integer between minVal and maxVal
 *
 * @throws {Error} If minVal > maxVal
 */
export function randomNumber(minVal, maxVal) {
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
 * @param {string} prompt - Prompt text
 * @param {number} maxLength - Maximum filename length (default: 50)
 * @returns {string} Safe filename string
 */
export function promptToFilename(prompt, maxLength = 50) {
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
 * @param {string} prefix - Filename prefix (e.g., prompt-based name)
 * @param {string} extension - File extension (e.g., 'png', 'jpg')
 * @returns {string} Timestamped filename
 */
export function generateTimestampedFilename(prefix, extension) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('Z')[0];
  return `${timestamp}_${prefix}.${extension}`;
}

/**
 * Create a spinner for long-running operations.
 * Returns an object with start() and stop() methods.
 *
 * @param {string} message - Message to display with spinner
 * @returns {Object} Spinner object with start() and stop() methods
 */
export function createSpinner(message) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frameIndex = 0;
  let interval = null;

  return {
    start() {
      process.stdout.write('\n');
      interval = setInterval(() => {
        const frame = frames[frameIndex];
        process.stdout.write(`\r${frame} ${message}`);
        frameIndex = (frameIndex + 1) % frames.length;
      }, 80);
    },

    stop(finalMessage = null) {
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

    update(newMessage) {
      message = newMessage;
    }
  };
}

/**
 * Set logger level.
 *
 * @param {string} level - Log level (debug, info, warn, error)
 */
export function setLogLevel(level) {
  logger.level = level.toLowerCase();
}

export { logger };

/* END */