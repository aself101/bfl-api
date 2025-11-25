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
  'flux-pro-fill': '/v1/flux-pro-1.0-fill',
  'flux-pro-fill-finetuned': '/v1/flux-pro-1.0-fill-finetuned',
  'flux-pro-expand': '/v1/flux-pro-1.0-expand',
  'kontext-pro': '/v1/flux-kontext-pro',
  'kontext-max': '/v1/flux-kontext-max',
  'flux-2-pro': '/v1/flux-2-pro',
  'flux-2-flex': '/v1/flux-2-flex'
};

// Model parameter constraints
export const MODEL_CONSTRAINTS = {
  'flux-dev': {
    width: { min: 256, max: 1440, divisibleBy: 32 },
    height: { min: 256, max: 1440, divisibleBy: 32 },
    steps: { min: 1, max: 50 },
    guidance: { min: 1.5, max: 5 },
    promptMaxLength: 10000
  },
  'flux-pro': {
    width: { min: 256, max: 1440, divisibleBy: 32 },
    height: { min: 256, max: 1440, divisibleBy: 32 },
    promptMaxLength: 10000
  },
  'flux-ultra': {
    aspectRatios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', '9:21'],
    raw: [true, false],
    imagePromptStrength: { min: 0, max: 1 },
    promptMaxLength: 10000
  },
  'flux-pro-fill': {
    steps: { min: 15, max: 50 },
    guidance: { min: 1.5, max: 100 },
    safetyTolerance: { min: 0, max: 6 },
    outputFormats: ['jpeg', 'png'],
    promptMaxLength: 10000
  },
  'flux-pro-fill-finetuned': {
    finetuneStrength: { min: 0, max: 2 },
    steps: { min: 15, max: 50 },
    guidance: { min: 1.5, max: 100 },
    safetyTolerance: { min: 0, max: 6 },
    outputFormats: ['jpeg', 'png'],
    promptMaxLength: 10000
  },
  'flux-pro-expand': {
    top: { min: 0, max: 2048 },
    bottom: { min: 0, max: 2048 },
    left: { min: 0, max: 2048 },
    right: { min: 0, max: 2048 },
    steps: { min: 15, max: 50 },
    guidance: { min: 1.5, max: 100 },
    safetyTolerance: { min: 0, max: 6 },
    outputFormats: ['jpeg', 'png'],
    promptMaxLength: 10000
  },
  'kontext-pro': {
    aspectRatios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', '9:21'],
    promptMaxLength: 10000
  },
  'kontext-max': {
    aspectRatios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', '9:21'],
    promptMaxLength: 10000
  },
  'flux-2-pro': {
    width: { min: 64, max: 2048, divisibleBy: 16 },
    height: { min: 64, max: 2048, divisibleBy: 16 },
    safetyTolerance: { min: 0, max: 5 },
    outputFormats: ['jpeg', 'png'],
    promptMaxLength: 10000,
    maxInputImages: 8
  },
  'flux-2-flex': {
    width: { min: 64, max: 2048, divisibleBy: 16 },
    height: { min: 64, max: 2048, divisibleBy: 16 },
    safetyTolerance: { min: 0, max: 5 },
    outputFormats: ['jpeg', 'png'],
    promptMaxLength: 10000,
    maxInputImages: 8
  }
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

/**
 * Validate model parameters against constraints.
 * Pre-flight validation to catch errors before making API calls and wasting credits.
 *
 * @param {string} model - Model name (flux-dev, flux-pro, flux-ultra, kontext-pro, kontext-max)
 * @param {Object} params - Parameters to validate
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 *
 * @example
 * const validation = validateModelParams('flux-dev', { width: 512, height: 512, steps: 30 });
 * if (!validation.valid) {
 *   console.error('Validation errors:', validation.errors);
 * }
 */
export function validateModelParams(model, params) {
  const errors = [];
  const constraints = MODEL_CONSTRAINTS[model];

  if (!constraints) {
    errors.push(`Unknown model: ${model}`);
    return { valid: false, errors };
  }

  // Validate prompt length
  if (params.prompt && params.prompt.length > constraints.promptMaxLength) {
    errors.push(
      `Prompt exceeds maximum length of ${constraints.promptMaxLength} characters for ${model}`
    );
  }

  // Validate width (flux-dev, flux-pro)
  if (params.width !== undefined && constraints.width) {
    const { min, max, divisibleBy } = constraints.width;
    if (params.width < min || params.width > max) {
      errors.push(`Width must be between ${min} and ${max} for ${model}`);
    }
    if (params.width % divisibleBy !== 0) {
      errors.push(`Width must be divisible by ${divisibleBy} for ${model}`);
    }
  }

  // Validate height (flux-dev, flux-pro)
  if (params.height !== undefined && constraints.height) {
    const { min, max, divisibleBy } = constraints.height;
    if (params.height < min || params.height > max) {
      errors.push(`Height must be between ${min} and ${max} for ${model}`);
    }
    if (params.height % divisibleBy !== 0) {
      errors.push(`Height must be divisible by ${divisibleBy} for ${model}`);
    }
  }

  // Validate steps (flux-dev only)
  if (params.steps !== undefined && constraints.steps) {
    const { min, max } = constraints.steps;
    if (params.steps < min || params.steps > max) {
      errors.push(`Steps must be between ${min} and ${max} for ${model}`);
    }
  }

  // Validate guidance (flux-dev only)
  if (params.guidance !== undefined && constraints.guidance) {
    const { min, max } = constraints.guidance;
    if (params.guidance < min || params.guidance > max) {
      errors.push(`Guidance must be between ${min} and ${max} for ${model}`);
    }
  }

  // Validate aspect_ratio (flux-ultra, kontext models)
  if (params.aspect_ratio && constraints.aspectRatios) {
    if (!constraints.aspectRatios.includes(params.aspect_ratio)) {
      errors.push(
        `Invalid aspect_ratio "${params.aspect_ratio}" for ${model}. Valid ratios: ${constraints.aspectRatios.join(', ')}`
      );
    }
  }

  // Validate raw (flux-ultra only)
  if (params.raw !== undefined && constraints.raw) {
    if (!constraints.raw.includes(params.raw)) {
      errors.push(`Invalid raw value for ${model}. Must be true or false`);
    }
  }

  // Validate image_prompt_strength (flux-ultra)
  if (params.image_prompt_strength !== undefined && constraints.imagePromptStrength) {
    const { min, max } = constraints.imagePromptStrength;
    if (params.image_prompt_strength < min || params.image_prompt_strength > max) {
      errors.push(`image_prompt_strength must be between ${min} and ${max} for ${model}`);
    }
  }

  // Validate safety_tolerance (flux-pro-fill)
  if (params.safety_tolerance !== undefined && constraints.safetyTolerance) {
    const { min, max } = constraints.safetyTolerance;
    if (params.safety_tolerance < min || params.safety_tolerance > max) {
      errors.push(`safety_tolerance must be between ${min} and ${max} for ${model}`);
    }
  }

  // Validate finetune_strength (flux-pro-fill-finetuned)
  if (params.finetune_strength !== undefined && constraints.finetuneStrength) {
    const { min, max } = constraints.finetuneStrength;
    if (params.finetune_strength < min || params.finetune_strength > max) {
      errors.push(`finetune_strength must be between ${min} and ${max} for ${model}`);
    }
  }

  // Validate output_format (flux-pro-fill, flux-pro-expand)
  if (params.output_format && constraints.outputFormats) {
    if (!constraints.outputFormats.includes(params.output_format)) {
      errors.push(
        `Invalid output_format "${params.output_format}" for ${model}. Valid formats: ${constraints.outputFormats.join(', ')}`
      );
    }
  }

  // Validate expansion parameters (flux-pro-expand)
  if (params.top !== undefined && constraints.top) {
    const { min, max } = constraints.top;
    if (params.top < min || params.top > max) {
      errors.push(`top must be between ${min} and ${max} for ${model}`);
    }
  }

  if (params.bottom !== undefined && constraints.bottom) {
    const { min, max } = constraints.bottom;
    if (params.bottom < min || params.bottom > max) {
      errors.push(`bottom must be between ${min} and ${max} for ${model}`);
    }
  }

  if (params.left !== undefined && constraints.left) {
    const { min, max } = constraints.left;
    if (params.left < min || params.left > max) {
      errors.push(`left must be between ${min} and ${max} for ${model}`);
    }
  }

  if (params.right !== undefined && constraints.right) {
    const { min, max } = constraints.right;
    if (params.right < min || params.right > max) {
      errors.push(`right must be between ${min} and ${max} for ${model}`);
    }
  }

  // Validate maxInputImages (FLUX.2 models)
  if (constraints.maxInputImages) {
    // Count input_image parameters (input_image, input_image_2, ..., input_image_8)
    const imageKeys = Object.keys(params).filter(key =>
      key === 'input_image' || key.match(/^input_image_[2-8]$/)
    );
    if (imageKeys.length > constraints.maxInputImages) {
      errors.push(
        `Maximum ${constraints.maxInputImages} input images allowed for ${model} (provided ${imageKeys.length})`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get model constraints for a specific model.
 *
 * @param {string} model - Model name
 * @returns {Object|null} Model constraints or null if model not found
 */
export function getModelConstraints(model) {
  return MODEL_CONSTRAINTS[model] || null;
}
