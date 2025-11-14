/**
 * Black Forest Labs API Configuration
 *
 * Handles authentication and API configuration settings.
 *
 * API key can be provided via (in priority order):
 * 1. Command line flag: --api-key
 * 2. Environment variable: BFL_API_KEY
 * 3. Local .env file in current directory
 * 4. Global config: ~/.bfl/.env (for global npm installs)
 *
 * To obtain an API key:
 * 1. Visit https://api.bfl.ml/
 * 2. Create an account or sign in
 * 3. Generate your API key from the dashboard
 */

import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Load environment variables in priority order:
// 1. First try local .env in current directory
dotenv.config();

// 2. Then try global config in home directory (if local .env doesn't exist)
const globalConfigPath = join(homedir(), '.bfl', '.env');
if (existsSync(globalConfigPath)) {
  dotenv.config({ path: globalConfigPath });
}

// BFL API Base URLs
export const BASE_URL = 'https://api.bfl.ai';
export const US_BASE_URL = 'https://api.us1.bfl.ai';

// Default polling configuration
export const DEFAULT_POLL_INTERVAL = 2; // seconds
export const DEFAULT_TIMEOUT = 300; // seconds (5 minutes)
export const MAX_RETRIES = 3;

// Model endpoints
export const MODEL_ENDPOINTS = {
  'flux-dev': '/v1/flux-dev',
  'flux-pro': '/v1/flux-pro-1.1',
  'flux-ultra': '/v1/flux-pro-1.1-ultra',
  'kontext-pro': '/v1/flux-kontext-pro',
  'kontext-max': '/v1/flux-kontext-max'
};

/**
 * Retrieve BFL API key from environment variables or CLI flag.
 *
 * @param {string} [cliApiKey] - Optional API key passed via CLI flag (highest priority)
 * @returns {string} The BFL API key
 * @throws {Error} If BFL_API_KEY is not found in any location
 *
 * @example
 * const apiKey = getBflApiKey();
 * const apiKey = getBflApiKey('sk-xxxxx'); // From CLI flag
 */
export function getBflApiKey(cliApiKey = null) {
  // Priority order:
  // 1. CLI flag (if provided)
  // 2. Environment variable
  const apiKey = cliApiKey || process.env.BFL_API_KEY;

  if (!apiKey) {
    const errorMessage = [
      'BFL_API_KEY not found. Please provide your API key via one of these methods:',
      '',
      '  1. CLI flag:           bfl --api-key YOUR_KEY --flux-dev --prompt "..."',
      '  2. Environment var:    export BFL_API_KEY=YOUR_KEY',
      '  3. Local .env file:    Create .env in current directory with BFL_API_KEY=YOUR_KEY',
      '  4. Global config:      Create ~/.bfl/.env with BFL_API_KEY=YOUR_KEY',
      '',
      'Get your API key at https://api.bfl.ml/'
    ].join('\n');

    throw new Error(errorMessage);
  }

  return apiKey;
}

/**
 * Validate that the API key appears to be in correct format.
 *
 * @param {string} apiKey - The API key string to validate
 * @returns {boolean} True if API key format appears valid, false otherwise
 */
export function validateApiKeyFormat(apiKey) {
  if (!apiKey) {
    return false;
  }

  // Basic validation - API key should be non-empty string
  if (apiKey.length < 10) {
    return false;
  }

  return true;
}

/**
 * Get the output directory for generated images.
 *
 * @returns {string} Output directory path
 */
export function getOutputDir() {
  return process.env.BFL_OUTPUT_DIR || 'datasets/bfl';
}

/**
 * Get the polling interval from environment or default.
 *
 * @returns {number} Polling interval in seconds
 */
export function getPollInterval() {
  const interval = parseInt(process.env.BFL_POLL_INTERVAL);
  return isNaN(interval) ? DEFAULT_POLL_INTERVAL : interval;
}

/**
 * Get the timeout from environment or default.
 *
 * @returns {number} Timeout in seconds
 */
export function getTimeout() {
  const timeout = parseInt(process.env.BFL_TIMEOUT);
  return isNaN(timeout) ? DEFAULT_TIMEOUT : timeout;
}
