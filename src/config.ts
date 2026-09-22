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
 * 1. Visit https://dashboard.bfl.ai/
 * 2. Create an account or sign in
 * 3. Generate your API key from the dashboard
 */

import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type {
  ModelEndpoints,
  ModelRegistry,
  ModelInfo,
  ModelConstraints,
  ModelConstraint,
  ValidationResult,
  ModelEndpointKey,
} from './types/index.js';

// Load environment variables in priority order:
// 1. First try local .env in current directory
dotenv.config();

// 2. Then try global config in home directory (if local .env doesn't exist)
const globalConfigPath = join(homedir(), '.bfl', '.env');
if (existsSync(globalConfigPath)) {
  dotenv.config({ path: globalConfigPath });
}

/**
 * Global API entry point. Submissions are routed from here to a regional host;
 * the response's `polling_url` names the one that owns the task.
 */
export const BASE_URL = 'https://api.bfl.ai';

/** US regional entry point, for callers who must pin submissions to that region. */
export const US_BASE_URL = 'https://api.us1.bfl.ai';

/** Default seconds between polls while a task is in flight. */
export const DEFAULT_POLL_INTERVAL = 2;

/** Default seconds to wait for a task to reach a terminal status (5 minutes). */
export const DEFAULT_TIMEOUT = 300;

/** Default retry budget for transient failures during polling. */
export const MAX_RETRIES = 3;

/**
 * Every endpoint the wrapper exposes: request path, log label, media kind, and
 * the server's default output_format where one exists.
 *
 * `defaultOutputFormat` is read from the OpenAPI schema, not guessed — Kontext
 * and the FLUX Tools image endpoints default to png while everything else
 * defaults to jpeg, and the CLI names files from this when --output-format is
 * omitted. Video endpoints have no output_format; they always deliver mp4.
 */
export const MODELS: ModelRegistry = {
  // FLUX.1 family
  'flux-dev': { path: '/v1/flux-dev', label: 'FLUX.1 [dev]', media: 'image', defaultOutputFormat: 'jpeg' },
  'flux-pro': { path: '/v1/flux-pro-1.1', label: 'FLUX 1.1 [pro]', media: 'image', defaultOutputFormat: 'jpeg' },
  'flux-ultra': { path: '/v1/flux-pro-1.1-ultra', label: 'FLUX 1.1 [pro] Ultra', media: 'image', defaultOutputFormat: 'jpeg' },
  'flux-ultra-finetuned': { path: '/v1/flux-pro-1.1-ultra-finetuned', label: 'FLUX 1.1 [pro] Ultra finetune', media: 'image', defaultOutputFormat: 'jpeg' },
  'flux-pro-fill': { path: '/v1/flux-pro-1.0-fill', label: 'FLUX.1 Fill [pro]', media: 'image', defaultOutputFormat: 'jpeg' },
  'flux-pro-fill-finetuned': { path: '/v1/flux-pro-1.0-fill-finetuned', label: 'FLUX.1 Fill [pro] finetune', media: 'image', defaultOutputFormat: 'jpeg' },
  'flux-pro-expand': { path: '/v1/flux-pro-1.0-expand', label: 'FLUX.1 Expand [pro]', media: 'image', defaultOutputFormat: 'jpeg' },
  'kontext-pro': { path: '/v1/flux-kontext-pro', label: 'Kontext Pro', media: 'image', defaultOutputFormat: 'png' },
  'kontext-max': { path: '/v1/flux-kontext-max', label: 'Kontext Max', media: 'image', defaultOutputFormat: 'png' },
  // FLUX.2 family
  'flux-2-pro': { path: '/v1/flux-2-pro', label: 'FLUX.2 [pro]', media: 'image', defaultOutputFormat: 'jpeg' },
  'flux-2-flex': { path: '/v1/flux-2-flex', label: 'FLUX.2 [flex]', media: 'image', defaultOutputFormat: 'jpeg' },
  'flux-2-max': { path: '/v1/flux-2-max', label: 'FLUX.2 [max]', media: 'image', defaultOutputFormat: 'jpeg' },
  'flux-2-klein-4b': { path: '/v1/flux-2-klein-4b', label: 'FLUX.2 [klein] 4B', media: 'image', defaultOutputFormat: 'jpeg' },
  'flux-2-klein-9b': { path: '/v1/flux-2-klein-9b', label: 'FLUX.2 [klein] 9B', media: 'image', defaultOutputFormat: 'jpeg' },
  // FLUX Tools (image)
  'flux-deblur': { path: '/v1/flux-tools/deblur-v1', label: 'FLUX Deblur', media: 'image', defaultOutputFormat: 'png' },
  'flux-erase': { path: '/v1/flux-tools/erase-v1', label: 'FLUX Erase', media: 'image', defaultOutputFormat: 'png' },
  'flux-outpaint': { path: '/v1/flux-tools/outpainting-v1', label: 'FLUX Outpaint', media: 'image', defaultOutputFormat: 'png' },
  'flux-vto': { path: '/v1/flux-tools/vto-v2', label: 'FLUX Virtual Try-On', media: 'image', defaultOutputFormat: 'jpeg' },
  // FLUX 3 (video)
  'flux-3-video': { path: '/v1/flux-3-video', label: 'FLUX 3 Video', media: 'video' },
  'flux-video-edit': { path: '/v1/flux-tools/video-edit-v1', label: 'FLUX Video Edit', media: 'video' },
  'flux-video-upscale': { path: '/v1/flux-tools/video-upscale-v1', label: 'FLUX Video Upscale', media: 'video' },
};

/** Ordered list of every model key. */
export const MODEL_KEYS = Object.keys(MODELS) as ModelEndpointKey[];

/**
 * Model → request path. Derived from MODELS; kept as the 1.x-shaped export.
 */
export const MODEL_ENDPOINTS: ModelEndpoints = Object.fromEntries(
  MODEL_KEYS.map((k) => [k, MODELS[k].path])
) as ModelEndpoints;

const ASPECT_RATIOS_1_1 = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', '9:21'];
const OUTPUT_FORMATS = ['jpeg', 'png', 'webp'];
const VIDEO_ASPECT_RATIOS = ['21:9', '2:1', '16:9', '4:3', '1:1', '3:4', '9:16', '9:21', 'auto'];
const VIDEO_RESOLUTIONS = ['hd', 'fhd', 'qhd', 'uhd'];
/** FLUX.2 [pro]/[flex]/[max]/[klein] dimensions: the spec states only a minimum of 64. */
const FLUX2_DIMENSION = { min: 64, max: 2048, divisibleBy: 16 };

const COMMON_FIELDS = ['user', 'webhook_url', 'webhook_secret'] as const;
const INPUT_IMAGES_4 = ['input_image', 'input_image_2', 'input_image_3', 'input_image_4'] as const;
const INPUT_IMAGES_8 = [
  ...INPUT_IMAGES_4,
  'input_image_5',
  'input_image_6',
  'input_image_7',
  'input_image_8',
] as const;
const FLUX1_TAIL = ['seed', 'safety_tolerance', 'output_format', 'prompt_upsampling', ...COMMON_FIELDS] as const;

/**
 * Per-mode request fields for FLUX 3 video. Each mode's server schema is strict
 * (`additionalProperties: false`), so the API method sends exactly one of these.
 */
export const FLUX3_VIDEO_MODE_FIELDS = {
  t2v: ['mode', 'prompt', 'aspect_ratio', 'duration', 'resolution', 'version', 'generate_audio', 'safety_tolerance', 'draft', 'user'],
  i2v: ['mode', 'prompt', 'keyframes', 'aspect_ratio', 'duration', 'resolution', 'version', 'generate_audio', 'safety_tolerance', 'draft', 'user'],
  v2v: ['mode', 'prompt', 'start_video', 'aspect_ratio', 'duration', 'resolution', 'version', 'generate_audio', 'safety_tolerance', 'draft', 'user'],
  draft_enhance: ['mode', 'draft_cache', 'resolution', 'safety_tolerance', 'user'],
} as const satisfies Record<string, readonly string[]>;

/**
 * Every request field the wrapper forwards, per model — the exact key set of the
 * payload builder in api.ts, and what scripts/check-spec-drift.ts compares to the
 * OpenAPI request schema. A field the API adds that is missing here fails that
 * check; a field listed here that the API drops fails it too.
 */
export const MODEL_FIELDS: Record<ModelEndpointKey, readonly string[]> = {
  'flux-dev': ['prompt', 'image_prompt', 'width', 'height', 'steps', 'guidance', ...FLUX1_TAIL],
  'flux-pro': ['prompt', 'image_prompt', 'width', 'height', ...FLUX1_TAIL],
  'flux-ultra': ['prompt', 'aspect_ratio', 'raw', 'image_prompt', 'image_prompt_strength', ...FLUX1_TAIL],
  // No `user` on this schema (checked against the spec, 2026-09-20).
  'flux-ultra-finetuned': ['finetune_id', 'finetune_strength', 'prompt', 'aspect_ratio', 'image_prompt', 'image_prompt_strength', 'seed', 'safety_tolerance', 'output_format', 'prompt_upsampling', 'webhook_url', 'webhook_secret'],
  'flux-pro-fill': ['image', 'mask', 'prompt', 'steps', 'guidance', ...FLUX1_TAIL],
  'flux-pro-fill-finetuned': ['finetune_id', 'finetune_strength', 'image', 'mask', 'prompt', 'steps', 'guidance', ...FLUX1_TAIL],
  'flux-pro-expand': ['image', 'top', 'bottom', 'left', 'right', 'prompt', 'steps', 'guidance', ...FLUX1_TAIL],
  'kontext-pro': ['prompt', ...INPUT_IMAGES_4, 'aspect_ratio', ...FLUX1_TAIL],
  'kontext-max': ['prompt', ...INPUT_IMAGES_4, 'aspect_ratio', ...FLUX1_TAIL],
  'flux-2-pro': ['prompt', 'disable_pup', ...INPUT_IMAGES_8, 'seed', 'width', 'height', 'safety_tolerance', 'output_format', ...COMMON_FIELDS],
  'flux-2-flex': ['prompt', 'prompt_upsampling', ...INPUT_IMAGES_8, 'seed', 'width', 'height', 'guidance', 'steps', 'safety_tolerance', 'output_format', ...COMMON_FIELDS],
  'flux-2-max': ['prompt', 'disable_pup', ...INPUT_IMAGES_8, 'seed', 'width', 'height', 'safety_tolerance', 'output_format', ...COMMON_FIELDS],
  'flux-2-klein-4b': ['prompt', ...INPUT_IMAGES_4, 'seed', 'width', 'height', 'safety_tolerance', 'output_format', ...COMMON_FIELDS],
  'flux-2-klein-9b': ['prompt', ...INPUT_IMAGES_4, 'seed', 'width', 'height', 'safety_tolerance', 'output_format', ...COMMON_FIELDS],
  'flux-deblur': ['image', 'seed', 'safety_tolerance', 'output_format', ...COMMON_FIELDS],
  'flux-erase': ['image', 'mask', 'dilate_pixels', 'seed', 'safety_tolerance', 'output_format', ...COMMON_FIELDS],
  'flux-outpaint': ['input_image', 'width', 'height', 'auto_crop', 'safety_tolerance', 'output_format', 'prompt', 'reference_offset_x', 'reference_offset_y', 'mode', 'disable_pup', 'user'],
  'flux-vto': ['prompt', 'person', 'garment', 'seed', 'safety_tolerance', 'output_format', ...COMMON_FIELDS],
  'flux-3-video': [...new Set(Object.values(FLUX3_VIDEO_MODE_FIELDS).flat())],
  'flux-video-edit': ['video', 'prompt', 'safety_tolerance', 'user'],
  'flux-video-upscale': ['input_video', 'prompt', 'creativity', 'upscale_factor', 'safety_tolerance', ...COMMON_FIELDS],
};

// Model parameter constraints
export const MODEL_CONSTRAINTS: ModelConstraints = {
  'flux-dev': {
    width: { min: 256, max: 1440, divisibleBy: 32 },
    height: { min: 256, max: 1440, divisibleBy: 32 },
    steps: { min: 1, max: 50 },
    guidance: { min: 1.5, max: 5 },
    safetyTolerance: { min: 0, max: 6 },
    outputFormats: OUTPUT_FORMATS,
    promptMaxLength: 10000,
  },
  'flux-pro': {
    width: { min: 256, max: 1440, divisibleBy: 32 },
    height: { min: 256, max: 1440, divisibleBy: 32 },
    safetyTolerance: { min: 0, max: 6 },
    outputFormats: OUTPUT_FORMATS,
    promptMaxLength: 10000,
  },
  'flux-ultra': {
    aspectRatios: ASPECT_RATIOS_1_1,
    raw: [true, false],
    imagePromptStrength: { min: 0, max: 1 },
    safetyTolerance: { min: 0, max: 6 },
    outputFormats: OUTPUT_FORMATS,
    promptMaxLength: 10000,
  },
  'flux-ultra-finetuned': {
    aspectRatios: ASPECT_RATIOS_1_1,
    imagePromptStrength: { min: 0, max: 1 },
    finetuneStrength: { min: 0, max: 2 },
    safetyTolerance: { min: 0, max: 6 },
    outputFormats: OUTPUT_FORMATS,
    promptMaxLength: 10000,
  },
  'flux-pro-fill': {
    steps: { min: 15, max: 50 },
    guidance: { min: 1.5, max: 100 },
    safetyTolerance: { min: 0, max: 6 },
    outputFormats: OUTPUT_FORMATS,
    promptMaxLength: 10000,
  },
  'flux-pro-fill-finetuned': {
    finetuneStrength: { min: 0, max: 2 },
    steps: { min: 15, max: 50 },
    guidance: { min: 1.5, max: 100 },
    safetyTolerance: { min: 0, max: 6 },
    outputFormats: OUTPUT_FORMATS,
    promptMaxLength: 10000,
  },
  'flux-pro-expand': {
    top: { min: 0, max: 2048 },
    bottom: { min: 0, max: 2048 },
    left: { min: 0, max: 2048 },
    right: { min: 0, max: 2048 },
    steps: { min: 15, max: 50 },
    guidance: { min: 1.5, max: 100 },
    safetyTolerance: { min: 0, max: 6 },
    outputFormats: OUTPUT_FORMATS,
    promptMaxLength: 10000,
  },
  'kontext-pro': {
    aspectRatios: ASPECT_RATIOS_1_1,
    safetyTolerance: { min: 0, max: 6 },
    outputFormats: OUTPUT_FORMATS,
    promptMaxLength: 10000,
    maxInputImages: 4,
  },
  'kontext-max': {
    aspectRatios: ASPECT_RATIOS_1_1,
    safetyTolerance: { min: 0, max: 6 },
    outputFormats: OUTPUT_FORMATS,
    promptMaxLength: 10000,
    maxInputImages: 4,
  },
  'flux-2-pro': {
    width: FLUX2_DIMENSION,
    height: FLUX2_DIMENSION,
    safetyTolerance: { min: 0, max: 5 },
    outputFormats: OUTPUT_FORMATS,
    promptMaxLength: 10000,
    maxInputImages: 8,
  },
  'flux-2-flex': {
    width: FLUX2_DIMENSION,
    height: FLUX2_DIMENSION,
    guidance: { min: 1.5, max: 10 },
    steps: { min: 1, max: 50 },
    safetyTolerance: { min: 0, max: 5 },
    outputFormats: OUTPUT_FORMATS,
    promptMaxLength: 10000,
    maxInputImages: 8,
  },
  'flux-2-max': {
    width: FLUX2_DIMENSION,
    height: FLUX2_DIMENSION,
    safetyTolerance: { min: 0, max: 5 },
    outputFormats: OUTPUT_FORMATS,
    promptMaxLength: 10000,
    maxInputImages: 8,
  },
  'flux-2-klein-4b': {
    width: FLUX2_DIMENSION,
    height: FLUX2_DIMENSION,
    safetyTolerance: { min: 0, max: 5 },
    outputFormats: OUTPUT_FORMATS,
    promptMaxLength: 10000,
    maxInputImages: 4,
  },
  'flux-2-klein-9b': {
    width: FLUX2_DIMENSION,
    height: FLUX2_DIMENSION,
    safetyTolerance: { min: 0, max: 5 },
    outputFormats: OUTPUT_FORMATS,
    promptMaxLength: 10000,
    maxInputImages: 4,
  },
  'flux-deblur': {
    safetyTolerance: { min: 0, max: 5 },
    outputFormats: OUTPUT_FORMATS,
  },
  'flux-erase': {
    safetyTolerance: { min: 0, max: 5 },
    outputFormats: OUTPUT_FORMATS,
    fields: {
      dilate_pixels: { range: { min: 0, max: 25 } },
    },
  },
  'flux-outpaint': {
    // Outpaint canvas: spec states only min 64, no divisibility requirement.
    width: { min: 64, max: 4096, divisibleBy: 1 },
    height: { min: 64, max: 4096, divisibleBy: 1 },
    safetyTolerance: { min: 0, max: 5 },
    outputFormats: OUTPUT_FORMATS,
    promptMaxLength: 10000,
    fields: {
      mode: { enum: ['high', 'fast'] },
    },
  },
  'flux-vto': {
    safetyTolerance: { min: 0, max: 5 },
    outputFormats: OUTPUT_FORMATS,
    promptMaxLength: 10000,
  },
  'flux-3-video': {
    safetyTolerance: { min: 0, max: 4 },
    fields: {
      mode: { enum: ['t2v', 'i2v', 'v2v', 'draft_enhance'] },
      aspect_ratio: { enum: VIDEO_ASPECT_RATIOS },
      // v2v caps at 15; enforced in validateModelParams because it depends on mode.
      duration: { range: { min: 5, max: 20 }, enum: ['auto'] },
      resolution: { enum: VIDEO_RESOLUTIONS },
      version: { enum: ['latest'] },
    },
  },
  'flux-video-edit': {
    safetyTolerance: { min: 0, max: 4 },
    promptMaxLength: 4096,
  },
  'flux-video-upscale': {
    safetyTolerance: { min: 0, max: 4 },
    fields: {
      creativity: { enum: [0, 1] },
      upscale_factor: { range: { min: 1.5, max: 3 } },
    },
  },
};

/**
 * Retrieve BFL API key from environment variables or CLI flag.
 *
 * @param cliApiKey - Optional API key passed via CLI flag (highest priority)
 * @returns The BFL API key
 * @throws Error if BFL_API_KEY is not found in any location
 *
 * @example
 * const apiKey = getBflApiKey();
 * const apiKey = getBflApiKey('sk-xxxxx'); // From CLI flag
 */
export function getBflApiKey(cliApiKey: string | null = null): string {
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
      'Get your API key at https://dashboard.bfl.ai/',
    ].join('\n');

    throw new Error(errorMessage);
  }

  return apiKey;
}

/**
 * Validate that the API key appears to be in correct format.
 *
 * @param apiKey - The API key string to validate
 * @returns True if API key format appears valid, false otherwise
 */
export function validateApiKeyFormat(apiKey: string): boolean {
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
 * @returns Output directory path
 */
export function getOutputDir(): string {
  return process.env.BFL_OUTPUT_DIR || 'datasets/bfl';
}

/**
 * Get the polling interval from environment or default.
 *
 * @returns Polling interval in seconds
 */
export function getPollInterval(): number {
  const interval = parseInt(process.env.BFL_POLL_INTERVAL || '', 10);
  return isNaN(interval) ? DEFAULT_POLL_INTERVAL : interval;
}

/**
 * Get the timeout from environment or default.
 *
 * @returns Timeout in seconds
 */
export function getTimeout(): number {
  const timeout = parseInt(process.env.BFL_TIMEOUT || '', 10);
  return isNaN(timeout) ? DEFAULT_TIMEOUT : timeout;
}

/**
 * Parameters object for validation (allows any string keys).
 */
interface ValidationParams {
  prompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  guidance?: number;
  aspect_ratio?: string;
  raw?: boolean;
  image_prompt_strength?: number;
  safety_tolerance?: number;
  finetune_strength?: number;
  output_format?: string;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  mode?: string;
  duration?: number | string;
  [key: string]: unknown;
}

/**
 * Validate model parameters against constraints.
 * Pre-flight validation to catch errors before making API calls and wasting credits.
 *
 * @param model - Model name (flux-dev, flux-pro, flux-ultra, kontext-pro, kontext-max)
 * @param params - Parameters to validate
 * @returns Validation result { valid: boolean, errors: string[] }
 *
 * @example
 * const validation = validateModelParams('flux-dev', { width: 512, height: 512, steps: 30 });
 * if (!validation.valid) {
 *   console.error('Validation errors:', validation.errors);
 * }
 */
export function validateModelParams(model: string, params: ValidationParams): ValidationResult {
  const errors: string[] = [];
  const constraints = MODEL_CONSTRAINTS[model as ModelEndpointKey];

  if (!constraints) {
    errors.push(`Unknown model: ${model}`);
    return { valid: false, errors };
  }

  // Validate prompt length
  if (params.prompt && constraints.promptMaxLength && params.prompt.length > constraints.promptMaxLength) {
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
    if (divisibleBy > 1 && params.width % divisibleBy !== 0) {
      errors.push(`Width must be divisible by ${divisibleBy} for ${model}`);
    }
  }

  // Validate height (flux-dev, flux-pro)
  if (params.height !== undefined && constraints.height) {
    const { min, max, divisibleBy } = constraints.height;
    if (params.height < min || params.height > max) {
      errors.push(`Height must be between ${min} and ${max} for ${model}`);
    }
    if (divisibleBy > 1 && params.height % divisibleBy !== 0) {
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

  // Validate 2.0-era fields generically (see ModelConstraint.fields)
  if (constraints.fields) {
    for (const [field, rule] of Object.entries(constraints.fields)) {
      const value = params[field];
      if (value === undefined || value === null) continue;
      const inEnum = rule.enum ? rule.enum.includes(value as string | number | boolean) : false;
      const inRange =
        rule.range && typeof value === 'number'
          ? value >= rule.range.min && value <= rule.range.max
          : false;
      if (inEnum || inRange) continue;
      const expected: string[] = [];
      if (rule.range) expected.push(`between ${rule.range.min} and ${rule.range.max}`);
      if (rule.enum) expected.push(`one of: ${rule.enum.join(', ')}`);
      errors.push(`${field} must be ${expected.join(' or ')} for ${model}`);
    }
  }

  // FLUX 3 video-continuation caps duration at 15s (t2v/i2v allow 20)
  if (model === 'flux-3-video' && params.mode === 'v2v' && typeof params.duration === 'number') {
    if (params.duration > 15) {
      errors.push('duration must be between 5 and 15 for flux-3-video in v2v mode');
    }
  }

  // Validate maxInputImages (FLUX.2 models)
  if (constraints.maxInputImages) {
    // Count input_image parameters (input_image, input_image_2, ..., input_image_8)
    const imageKeys = Object.keys(params).filter(
      (key) => key === 'input_image' || /^input_image_[2-8]$/.test(key)
    );
    if (imageKeys.length > constraints.maxInputImages) {
      errors.push(
        `Maximum ${constraints.maxInputImages} input images allowed for ${model} (provided ${imageKeys.length})`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get model constraints for a specific model.
 *
 * @param model - Model name
 * @returns Model constraints or null if model not found
 */
export function getModelConstraints(model: string): ModelConstraint | null {
  return MODEL_CONSTRAINTS[model as ModelEndpointKey] || null;
}

/**
 * Get static endpoint info (path, label, media kind, default output format).
 *
 * @param model - Model name
 * @returns Model info or null if model not found
 */
export function getModelInfo(model: string): ModelInfo | null {
  return MODELS[model as ModelEndpointKey] || null;
}
