/**
 * BFL Service Utility Functions
 *
 * Utility functions for BFL image generation, including file I/O,
 * image handling, polling, and data transformations.
 */

import fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import path from 'path';
import { promisify } from 'util';
import winston from 'winston';
import axios from 'axios';

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
 * @throws {Error} If URL can't be fetched
 */
export async function urlToBase64(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer'
    });
    const base64 = Buffer.from(response.data).toString('base64');
    logger.debug(`Downloaded and converted ${url} to base64 (${base64.length} chars)`);
    return base64;
  } catch (error) {
    logger.error(`Error downloading image from URL: ${error.message}`);
    throw new Error(`Failed to download image from '${url}': ${error.message}`);
  }
}

/**
 * Convert image input (file path or URL) to base64 string.
 *
 * @param {string} input - Local file path or URL
 * @returns {Promise<string>} Base64-encoded image string
 */
export async function imageToBase64(input) {
  // Check if input is a URL
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return await urlToBase64(input);
  } else {
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
    const dir = path.dirname(filepath);
    await ensureDirectory(dir);

    const response = await axios.get(url, {
      responseType: 'arraybuffer'
    });

    await fs.writeFile(filepath, Buffer.from(response.data));
    logger.info(`Downloaded image to ${filepath}`);
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
