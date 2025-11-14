/**
 * Black Forest Labs API Configuration
 *
 * Handles authentication and API configuration settings.
 * API key should be stored in .env file as BFL_API_KEY.
 *
 * To obtain an API key:
 * 1. Visit https://api.bfl.ml/
 * 2. Create an account or sign in
 * 3. Generate your API key from the dashboard
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

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
 * Retrieve BFL API key from environment variables.
 *
 * @returns {string} The BFL API key
 * @throws {Error} If BFL_API_KEY is not set in environment variables
 *
 * @example
 * const apiKey = getBflApiKey();
 */
export function getBflApiKey() {
  const apiKey = process.env.BFL_API_KEY;

  if (!apiKey) {
    throw new Error(
      'BFL_API_KEY not found in environment variables. ' +
      'Please add it to your .env file. ' +
      'Get your API key at https://api.bfl.ml/'
    );
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
