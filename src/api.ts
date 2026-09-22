/**
 * Black Forest Labs API Wrapper
 *
 * Main API wrapper class for interacting with the BFL Generation API.
 * Provides methods for generating images (FLUX.1, FLUX.2, Kontext, FLUX Tools)
 * and video (FLUX 3).
 *
 * All generation methods follow a consistent pattern:
 * 1. Verify API key is set
 * 2. Build request payload (only fields the caller set are sent, so server
 *    defaults apply — see docs/DECISIONS.md #2)
 * 3. Submit generation request
 * 4. Return task object with ID and polling URL
 * 5. Optionally poll for completion with retry logic
 *
 * @example
 * const api = new BflAPI();
 * const task = await api.generateFluxDev({ prompt: 'a cat', width: 1024, height: 768 });
 * const result = await api.waitForResult(task.id, { pollingUrl: task.polling_url });
 */

import winston from 'winston';
import { getBflApiKey, BASE_URL, MODELS, MODEL_FIELDS, FLUX3_VIDEO_MODE_FIELDS, MAX_RETRIES } from './config.js';
import {
  requestJson,
  BflHttpError,
  BflNetworkError,
  BflTimeoutError,
} from './http.js';
import { pause, createSpinner } from './utils.js';
import type {
  BflApiOptions,
  TaskResult,
  TaskStatus,
  SubmitResult,
  CreditsResult,
  FinetunesResult,
  FinetuneDetailsResult,
  DeleteFinetuneResult,
  WaitResultOptions,
  FluxDevParams,
  FluxProParams,
  FluxProUltraParams,
  FluxProUltraFinetunedParams,
  FluxProFillParams,
  FluxProFillFinetunedParams,
  FluxProExpandParams,
  KontextProParams,
  KontextMaxParams,
  Flux2ProParams,
  Flux2FlexParams,
  Flux2KleinParams,
  FluxDeblurParams,
  FluxEraseParams,
  FluxOutpaintParams,
  FluxVtoParams,
  Flux3VideoParams,
  FluxVideoEditParams,
  FluxVideoUpscaleParams,
  ModelEndpointKey,
  GenericErrorMessages,
} from './types/index.js';

/** Statuses on which polling keeps going. */
const IN_FLIGHT_STATUSES: ReadonlySet<TaskStatus> = new Set(['Pending', 'Reasoning', 'Generating']);

/**
 * A task that settled in a failure state: moderated, errored, or not found.
 *
 * Distinct from `BflHttpError` (the request itself failed) — the request
 * succeeded and the *task* failed, so retrying the poll cannot help. The
 * polling loop classifies on this type rather than on message text: the old
 * code matched `err.message.includes('moderated')` against a message thrown
 * a few lines above it, so rewording one silently broke the other.
 */
export class BflTaskError extends Error {
  readonly taskStatus: TaskStatus;
  readonly taskId: string;

  constructor(message: string, taskStatus: TaskStatus, taskId: string) {
    super(message);
    this.name = 'BflTaskError';
    this.taskStatus = taskStatus;
    this.taskId = taskId;
  }
}

/** Does this look like a task result rather than an arbitrary error body? */
function isTaskResultBody(body: unknown): body is TaskResult {
  if (!body || typeof body !== 'object') return false;
  const b = body as Partial<TaskResult>;
  return typeof b.status === 'string' && typeof b.id === 'string';
}

/**
 * Copy the given keys from `params` into a payload, skipping undefined / null.
 * Booleans and 0 are kept. Empty strings are kept for `prompt` (some endpoints
 * take '' as "neutral"), dropped elsewhere.
 */
function pick(params: object, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const source = params as Record<string, unknown>;
  for (const key of keys) {
    const value = source[key];
    if (value === undefined || value === null) continue;
    if (value === '' && key !== 'prompt') continue;
    out[key] = value;
  }
  return out;
}

/**
 * Wrapper class for Black Forest Labs Generation API.
 *
 * Provides methods to generate images and video, poll for results, and manage
 * account credits and finetunes.
 */
export class BflAPI {
  private apiKey: string;
  private baseUrl: string;
  private logger: winston.Logger;

  /**
   * Initialize BflAPI instance.
   *
   * @param options - Configuration options
   * @param options.apiKey - BFL API key. If null, reads from environment variable.
   * @param options.baseUrl - API base URL (default: https://api.bfl.ai)
   * @param options.logLevel - Logging level (DEBUG, INFO, WARNING, ERROR, NONE)
   *
   * @throws Error if API key is not provided and not in environment
   */
  constructor({ apiKey = null, baseUrl = BASE_URL, logLevel = 'INFO' }: BflApiOptions = {}) {
    // Setup logging (support NONE to silence all logs during tests)
    const isSilent = logLevel.toUpperCase() === 'NONE';
    this.logger = winston.createLogger({
      level: isSilent ? 'error' : logLevel.toLowerCase(),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} - ${level.toUpperCase()} - ${message}`;
        })
      ),
      transports: [
        new winston.transports.Console({
          silent: isSilent,
        }),
      ],
    });

    // Validate baseUrl uses HTTPS
    if (baseUrl && !baseUrl.startsWith('https://')) {
      throw new Error('API base URL must use HTTPS protocol for security');
    }

    // Set API key
    this.apiKey = apiKey || getBflApiKey();
    this.baseUrl = baseUrl;

    this.logger.info('BflAPI initialized successfully');
  }

  /**
   * Verify that API key is set.
   *
   * @throws Error if API key is not set
   */
  private _verifyApiKey(): void {
    if (!this.apiKey) {
      throw new Error(
        'API key not set. Please provide apiKey during initialization ' +
          'or set BFL_API_KEY environment variable.'
      );
    }
  }

  /**
   * Redact API key for safe logging.
   * Shows only the last 4 characters to prevent key exposure in logs.
   *
   * @param apiKey - API key to redact
   * @returns Redacted API key (e.g., "xxx...abc1234")
   */
  private _redactApiKey(apiKey: string): string {
    if (!apiKey || apiKey.length < 8) {
      return '[REDACTED]';
    }
    return `xxx...${apiKey.slice(-4)}`;
  }

  /**
   * Sanitize error messages for production environments.
   * Returns generic messages in production to avoid information disclosure.
   *
   * @param status - HTTP status code
   * @param body - Parsed response body, when the server sent one
   * @param fallback - Message to use when the body carries no detail
   * @returns Sanitized error message
   */
  private _sanitizeErrorMessage(status: number, body: unknown, fallback: string): string {
    // In production, return generic messages to avoid information disclosure
    if (process.env.NODE_ENV === 'production') {
      const genericMessages: GenericErrorMessages = {
        400: 'Invalid request parameters',
        401: 'Authentication failed',
        403: 'Access forbidden',
        404: 'Resource not found',
        422: 'Invalid parameters',
        429: 'Rate limit exceeded',
        500: 'Service error',
        502: 'Service temporarily unavailable',
        503: 'Service temporarily unavailable',
      };

      return genericMessages[status] || 'An error occurred';
    }

    // In development, return detailed error messages
    const responseData =
      body && typeof body === 'object'
        ? (body as { detail?: unknown; error?: string })
        : undefined;
    const errorDetail = responseData?.detail || responseData?.error || fallback;

    // If errorDetail is an object, stringify it
    if (typeof errorDetail === 'object' && errorDetail !== null) {
      return JSON.stringify(errorDetail);
    }

    return String(errorDetail);
  }

  /**
   * Make HTTP request to BFL API.
   *
   * @param method - HTTP method (GET, POST)
   * @param endpoint - API endpoint path
   * @param data - Request payload
   * @returns JSON response from API
   *
   * @throws Error if request fails
   */
  private async _makeRequest<T = unknown>(
    method: string,
    endpoint: string,
    data: Record<string, unknown> | null = null
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      accept: 'application/json',
      'x-key': this.apiKey,
      'Content-Type': 'application/json',
    };

    // Sanitized headers for logging (redact API key)
    const sanitizedHeaders = {
      ...headers,
      'x-key': this._redactApiKey(this.apiKey),
    };

    this.logger.debug(`API request: ${method} ${endpoint}`, { headers: sanitizedHeaders });

    const verb = method.toUpperCase();
    if (verb !== 'GET' && verb !== 'POST') {
      throw new Error(`Unsupported HTTP method: ${method}`);
    }

    try {
      const result = await requestJson<T>(url, {
        method: verb,
        headers,
        json: data,
        timeoutMs: 30000,
        maxRedirects: 5,
      });

      this.logger.debug(`API request successful: ${method} ${endpoint}`);
      return result;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`API request failed: ${err.message}`);

      // Map HTTP failures onto the messages consumers have always seen, keeping
      // status / retryAfter / body so callers can still inspect them.
      if (error instanceof BflHttpError) {
        const { status, retryAfter, body } = error;
        const sanitized = this._sanitizeErrorMessage(status, body, err.message);

        if (status === 401) {
          throw new BflHttpError('Authentication failed. Please check your API key.', status, retryAfter, body);
        } else if (status === 422) {
          throw new BflHttpError(`Invalid parameters: ${sanitized}`, status, retryAfter, body);
        } else if (status === 429) {
          throw new BflHttpError(
            'Rate limit exceeded. Please wait before making more requests.',
            status,
            retryAfter,
            body
          );
        } else if (status === 502 || status === 503) {
          throw new BflHttpError(
            `Service temporarily unavailable (${status}). Please retry.`,
            status,
            retryAfter,
            body
          );
        } else {
          throw new BflHttpError(`HTTP ${status}: ${sanitized}`, status, retryAfter, body);
        }
      }

      throw error;
    }
  }

  /**
   * Submit generation request with standardized error handling.
   */
  private async _submitGeneration(
    modelKey: ModelEndpointKey,
    payload: Record<string, unknown>
  ): Promise<SubmitResult> {
    this._verifyApiKey();
    const { path, label } = MODELS[modelKey];
    try {
      const result = await this._makeRequest<SubmitResult>('POST', path, payload);
      this.logger.info(`${label} generation submitted: ${result.id}`);
      return result;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Error generating with ${label}: ${err.message}`);
      throw error;
    }
  }

  // ==================== FLUX.1 [dev] ====================

  /**
   * Generate image using FLUX.1 [dev] model.
   * Provides full control over inference steps and guidance scale.
   *
   * @param params - Generation parameters
   * @returns Task object with id and polling_url
   *
   * @example
   * const task = await api.generateFluxDev({
   *   prompt: 'A serene mountain landscape',
   *   width: 1024,
   *   height: 768,
   *   steps: 28,
   *   guidance: 3
   * });
   */
  async generateFluxDev(params: FluxDevParams): Promise<SubmitResult> {
    const payload = {
      prompt: params.prompt,
      width: params.width || 1024,
      height: params.height || 768,
      steps: params.steps || 28,
      guidance: params.guidance || 3,
      ...pick(params, MODEL_FIELDS['flux-dev']),
    };

    return this._submitGeneration('flux-dev', payload);
  }

  // ==================== FLUX 1.1 [pro] ====================

  /**
   * Generate image using FLUX 1.1 [pro] model.
   * Professional quality with Redux image prompting support.
   *
   * @param params - Generation parameters
   * @returns Task object with id and polling_url
   *
   * @example
   * const task = await api.generateFluxPro({
   *   prompt: 'A modern office interior',
   *   width: 1024,
   *   height: 1024,
   *   image_prompt: 'base64_encoded_image_string'
   * });
   */
  async generateFluxPro(params: FluxProParams): Promise<SubmitResult> {
    const payload = {
      prompt: params.prompt,
      width: params.width || 1024,
      height: params.height || 768,
      ...pick(params, MODEL_FIELDS['flux-pro']),
    };

    return this._submitGeneration('flux-pro', payload);
  }

  // ==================== FLUX 1.1 [pro] Ultra ====================

  /**
   * Generate image using FLUX 1.1 [pro] Ultra model.
   * Maximum quality with aspect ratio control and raw mode.
   *
   * @param params - Generation parameters
   * @returns Task object with id and polling_url
   *
   * @example
   * const task = await api.generateFluxProUltra({
   *   prompt: 'Cinematic landscape photography',
   *   aspect_ratio: '21:9',
   *   raw: true
   * });
   */
  async generateFluxProUltra(params: FluxProUltraParams): Promise<SubmitResult> {
    const payload = {
      prompt: params.prompt,
      aspect_ratio: params.aspect_ratio || '16:9',
      raw: params.raw || false,
      ...pick(params, MODEL_FIELDS['flux-ultra']),
    };

    return this._submitGeneration('flux-ultra', payload);
  }

  /**
   * Generate image using FLUX 1.1 [pro] Ultra with a fine-tuned model.
   *
   * @param params - Generation parameters
   * @returns Task object with id and polling_url
   *
   * @example
   * const task = await api.generateFluxProUltraFinetuned({
   *   finetune_id: 'my-finetune',
   *   prompt: 'Product shot in my brand style',
   *   finetune_strength: 1.2,
   *   aspect_ratio: '1:1'
   * });
   */
  async generateFluxProUltraFinetuned(
    params: FluxProUltraFinetunedParams
  ): Promise<SubmitResult> {
    if (!params.finetune_id) {
      throw new Error('finetune_id is required for FLUX 1.1 [pro] Ultra finetune');
    }

    const payload = {
      finetune_id: params.finetune_id,
      prompt: params.prompt || '',
      ...pick(params, MODEL_FIELDS['flux-ultra-finetuned']),
    };

    return this._submitGeneration('flux-ultra-finetuned', payload);
  }

  // ==================== FLUX.1 Fill [pro] ====================

  /**
   * Generate image using FLUX.1 Fill [pro] model.
   * Inpainting - modify specific areas of images using masks.
   *
   * @param params - Generation parameters
   * @returns Task object with id and polling_url
   *
   * @example
   * const task = await api.generateFluxProFill({
   *   image: 'path/to/image.jpg',
   *   mask: 'path/to/mask.png',
   *   prompt: 'A beautiful sunset sky',
   *   steps: 30,
   *   guidance: 3
   * });
   */
  async generateFluxProFill(params: FluxProFillParams): Promise<SubmitResult> {
    if (!params.image) {
      throw new Error('image is required for FLUX.1 Fill [pro]');
    }

    if (!params.prompt) {
      throw new Error('prompt is required for FLUX.1 Fill [pro]');
    }

    const payload = {
      image: params.image,
      prompt: params.prompt,
      ...pick(params, MODEL_FIELDS['flux-pro-fill']),
    };

    return this._submitGeneration('flux-pro-fill', payload);
  }

  /**
   * Generate image using FLUX.1 Fill [pro] with a fine-tuned model.
   * Inpainting with custom trained models using input image and mask.
   *
   * @param params - Generation parameters
   * @returns Task object with id and polling_url
   *
   * @example
   * const task = await api.generateFluxProFillFinetuned({
   *   finetune_id: 'my-finetune',
   *   image: 'path/to/image.jpg',
   *   prompt: 'A beautiful sunset sky',
   *   finetune_strength: 1.1,
   *   steps: 30,
   *   guidance: 60
   * });
   */
  async generateFluxProFillFinetuned(params: FluxProFillFinetunedParams): Promise<SubmitResult> {
    if (!params.finetune_id) {
      throw new Error('finetune_id is required for FLUX.1 Fill [pro] finetune');
    }

    if (!params.image) {
      throw new Error('image is required for FLUX.1 Fill [pro] finetune');
    }

    const payload = {
      finetune_id: params.finetune_id,
      image: params.image,
      prompt: params.prompt || '',
      ...pick(params, MODEL_FIELDS['flux-pro-fill-finetuned']),
    };

    return this._submitGeneration('flux-pro-fill-finetuned', payload);
  }

  /**
   * Generate image using FLUX.1 Expand [pro] model.
   * Expands images by adding pixels on any combination of sides while maintaining context.
   *
   * @param params - Generation parameters
   * @returns Task object with id and polling_url
   *
   * @example
   * const task = await api.generateFluxProExpand({
   *   image: 'path/to/image.jpg',
   *   top: 512,
   *   bottom: 256,
   *   prompt: 'Extend the sky with dramatic clouds',
   *   steps: 30,
   *   guidance: 60
   * });
   */
  async generateFluxProExpand(params: FluxProExpandParams): Promise<SubmitResult> {
    if (!params.image) {
      throw new Error('image is required for FLUX.1 Expand [pro]');
    }

    const payload: Record<string, unknown> = {
      image: params.image,
      ...pick(params, MODEL_FIELDS['flux-pro-expand']),
    };
    // Expand's prompt is optional; don't send an empty one.
    if (payload.prompt === '') delete payload.prompt;

    return this._submitGeneration('flux-pro-expand', payload);
  }

  // ==================== Kontext ====================

  /**
   * Shared Kontext payload builder. `input_image` is optional — Kontext
   * generates from text alone when no image is supplied.
   */
  private _kontextPayload(params: KontextProParams): Record<string, unknown> {
    return { prompt: params.prompt, ...pick(params, MODEL_FIELDS['kontext-pro']) };
  }

  /**
   * Generate or edit an image using Kontext Pro.
   * Multi-reference image editing with context preservation; text-only generation
   * when no input image is given.
   *
   * @param params - Generation parameters
   * @returns Task object with id and polling_url
   *
   * @example
   * const task = await api.generateKontextPro({
   *   prompt: 'A small furry elephant pet looks out from a cat house',
   *   input_image: 'base64_encoded_image_string'
   * });
   */
  async generateKontextPro(params: KontextProParams): Promise<SubmitResult> {
    return this._submitGeneration('kontext-pro', this._kontextPayload(params));
  }

  /**
   * Generate or edit an image using Kontext Max.
   * Maximum quality multi-reference image editing.
   *
   * @param params - Generation parameters
   * @returns Task object with id and polling_url
   *
   * @example
   * const task = await api.generateKontextMax({
   *   prompt: 'Transform into a watercolor painting style',
   *   input_image: 'base64_encoded_image_string'
   * });
   */
  async generateKontextMax(params: KontextMaxParams): Promise<SubmitResult> {
    return this._submitGeneration('kontext-max', this._kontextPayload(params));
  }

  // ==================== FLUX.2 MODELS ====================

  /**
   * Payload for the `Flux2Inputs` schema (FLUX.2 [pro] and [max]).
   * Prompt upsampling is on by default server-side; `disable_pup` turns it off.
   */
  private _flux2ProPayload(params: Flux2ProParams): Record<string, unknown> {
    return { prompt: params.prompt, ...pick(params, MODEL_FIELDS['flux-2-pro']) };
  }

  /**
   * Generate or edit image using FLUX.2 [pro] model.
   * Supports multi-image input for contextual generation and editing.
   *
   * @param params - Generation parameters
   * @returns Task object with id, polling_url, cost, input_mp, output_mp
   *
   * @example
   * // Text-to-image generation
   * const task = await api.generateFlux2Pro({
   *   prompt: 'A majestic castle on a cliff',
   *   width: 1024,
   *   height: 1024
   * });
   *
   * @example
   * // Image editing with context, prompt used verbatim
   * const task = await api.generateFlux2Pro({
   *   prompt: 'Add a dragon flying above the castle',
   *   input_image: 'base64_or_url_of_castle_image',
   *   disable_pup: true
   * });
   */
  async generateFlux2Pro(params: Flux2ProParams): Promise<SubmitResult> {
    return this._submitGeneration('flux-2-pro', this._flux2ProPayload(params));
  }

  /**
   * Generate or edit image using FLUX.2 [max] model.
   * Same request shape as [pro]; highest quality tier.
   *
   * @param params - Generation parameters
   * @returns Task object with id, polling_url, cost, input_mp, output_mp
   */
  async generateFlux2Max(params: Flux2ProParams): Promise<SubmitResult> {
    return this._submitGeneration('flux-2-max', this._flux2ProPayload(params));
  }

  /**
   * Generate or edit image using FLUX.2 [flex] model.
   * Exposes guidance and steps; prompt upsampling defaults to true.
   *
   * @param params - Generation parameters
   * @returns Task object with id, polling_url, cost, input_mp, output_mp
   *
   * @example
   * const task = await api.generateFlux2Flex({
   *   prompt: 'Combine the style and subject',
   *   input_image: 'base64_or_url_of_subject',
   *   input_image_2: 'base64_or_url_of_style_ref',
   *   guidance: 4,
   *   steps: 30
   * });
   */
  async generateFlux2Flex(params: Flux2FlexParams): Promise<SubmitResult> {
    const payload = {
      prompt: params.prompt,
      ...pick(params, MODEL_FIELDS['flux-2-flex']),
    };

    return this._submitGeneration('flux-2-flex', payload);
  }

  /** Payload for the `Flux2KleinInputs` schema (4B and 9B). */
  private _flux2KleinPayload(params: Flux2KleinParams): Record<string, unknown> {
    return { prompt: params.prompt, ...pick(params, MODEL_FIELDS['flux-2-klein-4b']) };
  }

  /**
   * Generate or edit image using FLUX.2 [klein] 4B — the fastest FLUX.2 tier.
   * Up to four input images.
   *
   * @param params - Generation parameters
   * @returns Task object with id, polling_url, cost, input_mp, output_mp
   */
  async generateFlux2Klein4b(params: Flux2KleinParams): Promise<SubmitResult> {
    return this._submitGeneration('flux-2-klein-4b', this._flux2KleinPayload(params));
  }

  /**
   * Generate or edit image using FLUX.2 [klein] 9B.
   * Up to four input images.
   *
   * @param params - Generation parameters
   * @returns Task object with id, polling_url, cost, input_mp, output_mp
   */
  async generateFlux2Klein9b(params: Flux2KleinParams): Promise<SubmitResult> {
    return this._submitGeneration('flux-2-klein-9b', this._flux2KleinPayload(params));
  }

  // ==================== FLUX TOOLS (IMAGE) ====================

  /**
   * Remove blur from an image. Takes only the image — there is no prompt or mask.
   *
   * @param params - Deblur parameters
   * @returns Task object with id and polling_url
   *
   * @example
   * const task = await api.deblurImage({ image: 'base64_or_url' });
   */
  async deblurImage(params: FluxDeblurParams): Promise<SubmitResult> {
    if (!params.image) {
      throw new Error('image is required for FLUX Deblur');
    }

    const payload = {
      image: params.image,
      ...pick(params, MODEL_FIELDS['flux-deblur']),
    };

    return this._submitGeneration('flux-deblur', payload);
  }

  /**
   * Erase an object from an image. White mask pixels mark what to remove.
   *
   * @param params - Erase parameters
   * @returns Task object with id and polling_url
   *
   * @example
   * const task = await api.eraseImage({
   *   image: 'base64_or_url',
   *   mask: 'base64_or_url_of_mask',
   *   dilate_pixels: 12
   * });
   */
  async eraseImage(params: FluxEraseParams): Promise<SubmitResult> {
    if (!params.image) {
      throw new Error('image is required for FLUX Erase');
    }
    if (!params.mask) {
      throw new Error('mask is required for FLUX Erase');
    }

    const payload = {
      image: params.image,
      mask: params.mask,
      ...pick(params, MODEL_FIELDS['flux-erase']),
    };

    return this._submitGeneration('flux-erase', payload);
  }

  /**
   * Outpaint an image onto a larger canvas.
   * Replaces the FLUX.1 top/bottom/left/right model with a target canvas size
   * and an optional placement offset (centred when omitted).
   *
   * @param params - Outpaint parameters
   * @returns Task object with id and polling_url
   *
   * @example
   * const task = await api.outpaintImage({
   *   input_image: 'base64_or_url',
   *   width: 2048,
   *   height: 1024,
   *   prompt: 'extend the horizon'
   * });
   */
  async outpaintImage(params: FluxOutpaintParams): Promise<SubmitResult> {
    if (!params.input_image) {
      throw new Error('input_image is required for FLUX Outpaint');
    }
    if (params.width === undefined || params.height === undefined) {
      throw new Error('width and height are required for FLUX Outpaint');
    }

    // Strict schema (additionalProperties: false): send only what is declared.
    const payload: Record<string, unknown> = {
      input_image: params.input_image,
      width: params.width,
      height: params.height,
      ...pick(params, MODEL_FIELDS['flux-outpaint']),
    };
    if (payload.prompt === '') delete payload.prompt;

    return this._submitGeneration('flux-outpaint', payload);
  }

  /**
   * Virtual try-on: render the person wearing the garment.
   *
   * @param params - Try-on parameters
   * @returns Task object with id and polling_url
   *
   * @example
   * const task = await api.virtualTryOn({
   *   prompt: 'TRY-ON: The person of image 1 wearing the garments of image 2.',
   *   person: 'base64_or_url',
   *   garment: 'base64_or_url'
   * });
   */
  async virtualTryOn(params: FluxVtoParams): Promise<SubmitResult> {
    if (!params.person) {
      throw new Error('person is required for FLUX Virtual Try-On');
    }
    if (!params.garment) {
      throw new Error('garment is required for FLUX Virtual Try-On');
    }
    if (!params.prompt) {
      throw new Error('prompt is required for FLUX Virtual Try-On');
    }

    const payload = {
      prompt: params.prompt,
      person: params.person,
      garment: params.garment,
      ...pick(params, MODEL_FIELDS['flux-vto']),
    };

    return this._submitGeneration('flux-vto', payload);
  }

  // ==================== FLUX 3 (VIDEO) ====================

  /**
   * Generate a video with FLUX 3.
   *
   * The request is a discriminated union on `mode`. Each mode's server schema is
   * strict (`additionalProperties: false`), so this method validates the mode's
   * required field client-side and sends only the fields that mode declares —
   * a wrong field would otherwise cost a round trip to learn about.
   *
   * @param params - Video parameters; `mode` selects t2v / i2v / v2v / draft_enhance
   * @returns Task object with id and polling_url
   *
   * @example
   * // Text-to-video
   * const task = await api.generateFlux3Video({
   *   mode: 't2v',
   *   prompt: 'A fox runs through autumn woods',
   *   duration: 8,
   *   resolution: 'fhd'
   * });
   *
   * @example
   * // Image-continuation with timed keyframes
   * const task = await api.generateFlux3Video({
   *   mode: 'i2v',
   *   prompt: 'The scene comes alive',
   *   keyframes: [[0, 'base64_or_url'], [4, 'base64_or_url']]
   * });
   */
  async generateFlux3Video(params: Flux3VideoParams): Promise<SubmitResult> {
    let payload: Record<string, unknown>;

    switch (params.mode) {
      case 't2v':
      case 'i2v':
      case 'v2v': {
        if (!params.prompt) {
          throw new Error(`prompt is required for FLUX 3 Video (${params.mode})`);
        }
        if (params.mode === 'i2v') {
          if (params.keyframes === undefined || (Array.isArray(params.keyframes) && params.keyframes.length === 0)) {
            throw new Error('keyframes is required for FLUX 3 Video (i2v)');
          }
        } else if (params.mode === 'v2v') {
          if (!params.start_video) {
            throw new Error('start_video is required for FLUX 3 Video (v2v)');
          }
        }
        payload = pick(params, FLUX3_VIDEO_MODE_FIELDS[params.mode]);
        break;
      }
      case 'draft_enhance': {
        if (!params.draft_cache) {
          throw new Error('draft_cache is required for FLUX 3 Video (draft_enhance)');
        }
        payload = pick(params, FLUX3_VIDEO_MODE_FIELDS.draft_enhance);
        break;
      }
      default: {
        const unknown = (params as { mode?: unknown }).mode;
        throw new Error(
          `Unknown FLUX 3 Video mode: ${String(unknown)} (expected t2v, i2v, v2v or draft_enhance)`
        );
      }
    }

    return this._submitGeneration('flux-3-video', payload);
  }

  /**
   * Edit a video with FLUX 3. Duration, resolution, aspect ratio and audio are
   * taken from the source (≤15 s, ≤50 MiB; >720p is downscaled).
   *
   * @param params - Edit parameters
   * @returns Task object with id and polling_url
   *
   * @example
   * const task = await api.editVideo({
   *   video: 'base64_mp4_or_url',
   *   prompt: 'Make it snow'
   * });
   */
  async editVideo(params: FluxVideoEditParams): Promise<SubmitResult> {
    if (!params.video) {
      throw new Error('video is required for FLUX Video Edit');
    }
    if (!params.prompt || !params.prompt.trim()) {
      throw new Error('prompt is required for FLUX Video Edit');
    }

    // Strict schema: only these four fields exist.
    const payload = {
      video: params.video,
      prompt: params.prompt,
      ...pick(params, MODEL_FIELDS['flux-video-edit']),
    };

    return this._submitGeneration('flux-video-edit', payload);
  }

  /**
   * Upscale a video with FLUX 3. Covers the first 20 seconds; output is capped
   * at a 13.75 MP frame so very large sources upscale by less than requested.
   *
   * @param params - Upscale parameters
   * @returns Task object with id and polling_url
   *
   * @example
   * const task = await api.upscaleVideo({
   *   input_video: 'base64_mp4_or_url',
   *   upscale_factor: 2,
   *   creativity: 0
   * });
   */
  async upscaleVideo(params: FluxVideoUpscaleParams): Promise<SubmitResult> {
    if (!params.input_video) {
      throw new Error('input_video is required for FLUX Video Upscale');
    }

    const payload = {
      input_video: params.input_video,
      ...pick(params, MODEL_FIELDS['flux-video-upscale']),
    };

    return this._submitGeneration('flux-video-upscale', payload);
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Get result for a specific task ID.
   * Polls the task once and returns current status.
   *
   * @param taskId - Task ID to poll
   * @param pollingUrl - The polling_url from the submit response. Tasks are regional; without
   *   it the global host is tried, which returns 404 for tasks served elsewhere.
   * @returns Task result object
   *
   * @example
   * const result = await api.getResult(task.id, task.polling_url);
   * if (result.status === 'Ready') {
   *   console.log('Image URL:', result.result.sample);
   * }
   */
  async getResult(taskId: string, pollingUrl: string | null = null): Promise<TaskResult> {
    this._verifyApiKey();

    try {
      let result: TaskResult;

      if (pollingUrl) {
        // Use the full polling URL provided by the API
        const headers = {
          accept: 'application/json',
          'x-key': this.apiKey,
        };

        try {
          result = await requestJson<TaskResult>(pollingUrl, {
            headers,
            // The polling GET carried no timeout before the fetch migration —
            // a hung poll would have blocked until waitForResult's own deadline.
            timeoutMs: 30000,
            maxRedirects: 5,
          });
        } catch (error) {
          // A settled failure can arrive as an HTTP error whose body is still a task
          // result — video endpoints answer 422 with {status: 'Error', details: {error}}.
          // Surface that as the result so the caller sees details.error, not "422".
          const body = error instanceof BflHttpError ? error.body : undefined;
          if (isTaskResultBody(body)) {
            result = body;
          } else {
            throw error;
          }
        }
      } else {
        // Fallback to constructing URL. Tasks are served from the regional host
        // named in the submit response's polling_url; the global host 404s for
        // a task that lives elsewhere, so explain that rather than echo "404".
        try {
          result = await this._makeRequest<TaskResult>('GET', `/v1/get_result?id=${taskId}`);
        } catch (error) {
          if (error instanceof BflHttpError && error.status === 404) {
            throw new BflHttpError(
              `Task ${taskId} not found at ${this.baseUrl}. Tasks are served from the regional host in the ` +
                'submit response (polling_url); pass that URL to getResult/waitForResult.',
              404
            );
          }
          throw error;
        }
      }

      this.logger.debug(`Polled task ${taskId}: ${result.status}`);
      return result;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Error polling task ${taskId}: ${err.message}`);
      throw error;
    }
  }

  /**
   * Read the error explanation from a settled task. The API moved this from
   * `result.error` to `details.error`; both are still checked.
   */
  private _taskErrorMessage(result: TaskResult): string {
    return result.details?.error || result.result?.error || 'Unknown error';
  }

  /**
   * Wait for task to complete with polling, spinner, and retry logic.
   *
   * Keeps polling on Pending / Reasoning / Generating. Returns on Ready. Throws
   * on Error, Content Moderated, Request Moderated, and Task not found — the
   * last immediately, since it will never change.
   *
   * @param taskId - Task ID to wait for
   * @param options - Polling options
   * @returns Completed task result
   *
   * @throws Error if task fails, times out, or max retries exceeded
   *
   * @example
   * const result = await api.waitForResult('abc123', {
   *   pollingUrl: 'https://api.eu2.bfl.ai/v1/get_result?id=abc123',
   *   timeout: 300,
   *   pollInterval: 2,
   *   showSpinner: true
   * });
   */
  async waitForResult(
    taskId: string,
    {
      pollingUrl = null,
      timeout = 300,
      pollInterval = 2,
      maxRetries = MAX_RETRIES,
      showSpinner = true,
    }: WaitResultOptions = {}
  ): Promise<TaskResult> {
    const startTime = Date.now();
    let retries = 0;
    let spinner: ReturnType<typeof createSpinner> | null = null;

    if (showSpinner) {
      spinner = createSpinner(`Waiting for generation to complete (task: ${taskId})`);
      spinner.start();
    }

    try {
      while (true) {
        // Check timeout
        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed > timeout) {
          throw new Error(`Timeout after ${timeout} seconds`);
        }

        try {
          const result = await this.getResult(taskId, pollingUrl);

          // Check status
          if (result.status === 'Ready') {
            if (spinner) {
              spinner.stop(`✓ Generation complete! (${elapsed.toFixed(1)}s)`);
            }
            return result;
          } else if (result.status === 'Error') {
            throw new BflTaskError(
              `Generation failed: ${this._taskErrorMessage(result)}`,
              'Error',
              taskId
            );
          } else if (result.status === 'Content Moderated') {
            throw new BflTaskError(
              'Content was moderated. Please revise your prompt.',
              'Content Moderated',
              taskId
            );
          } else if (result.status === 'Request Moderated') {
            throw new BflTaskError(
              'Request was moderated. Please revise your prompt or inputs.',
              'Request Moderated',
              taskId
            );
          } else if (result.status === 'Task not found') {
            throw new BflTaskError(`Task not found: ${taskId}`, 'Task not found', taskId);
          } else if (IN_FLIGHT_STATUSES.has(result.status)) {
            // Continue polling
            if (spinner) {
              const timeLeft = Math.max(0, timeout - elapsed).toFixed(0);
              const progress =
                typeof result.progress === 'number'
                  ? ` ${Math.round(result.progress * 100)}%`
                  : '';
              spinner.update(
                `Generating... ${result.status}${progress} (${elapsed.toFixed(0)}s elapsed, ~${timeLeft}s remaining)`
              );
            }
          } else {
            // Unknown status: keep polling rather than fail, but say so.
            this.logger.warn(`Unrecognised task status "${String(result.status)}"; continuing to poll`);
          }

          // Reset retry count on successful poll
          retries = 0;
        } catch (error) {
          const err = error as Error;

          // A settled task failure is final by construction — retrying the poll
          // returns the same answer. Classified by type, not by message text.
          if (error instanceof BflTaskError) {
            throw error;
          }

          // Transient: the service said "later" (502/503), the transport failed
          // in a recoverable way, or the poll timed out. Under axios the network
          // arm of this was dead code — it matched 'ECONNRESET' against a message
          // that read 'socket hang up', so a reset was never retried.
          const isTransient =
            (error instanceof BflHttpError && (error.status === 502 || error.status === 503)) ||
            (error instanceof BflNetworkError && error.retryable) ||
            error instanceof BflTimeoutError;

          if (isTransient && retries < maxRetries) {
            retries++;
            // Honour Retry-After on the polling URL when the server sends one;
            // otherwise exponential backoff: 2s, 4s, 8s.
            const retryAfter = error instanceof BflHttpError ? error.retryAfter : undefined;
            const backoff = retryAfter ?? Math.pow(2, retries);
            this.logger.warn(`Transient error (retry ${retries}/${maxRetries}): ${err.message}`);
            if (spinner) {
              spinner.update(`Retrying after error... (attempt ${retries}/${maxRetries})`);
            }
            await pause(backoff);
            continue;
          }

          // Max retries exceeded or non-transient error
          throw error;
        }

        // Wait before next poll
        await pause(pollInterval);
      }
    } finally {
      if (spinner) {
        spinner.stop();
      }
    }
  }

  /**
   * Get user account credits balance.
   *
   * @returns Credits information
   *
   * @example
   * const credits = await api.getUserCredits();
   * console.log('Credits remaining:', credits.credits);
   */
  async getUserCredits(): Promise<CreditsResult> {
    this._verifyApiKey();

    try {
      const result = await this._makeRequest<CreditsResult>('GET', '/v1/credits');
      this.logger.info(`User credits: ${result.credits}`);
      return result;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Error fetching user credits: ${err.message}`);
      throw error;
    }
  }

  /**
   * Get list of all fine-tuned models created by the user.
   *
   * @returns Object containing array of finetune_ids
   *
   * @example
   * const { finetunes } = await api.getMyFinetunes();
   * console.log('Your finetunes:', finetunes);
   */
  async getMyFinetunes(): Promise<FinetunesResult> {
    this._verifyApiKey();

    try {
      const result = await this._makeRequest<FinetunesResult>('GET', '/v1/my_finetunes');
      const count = result.finetunes?.length || 0;
      this.logger.info(`Found ${count} fine-tuned model(s)`);
      return result;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Error fetching finetunes: ${err.message}`);
      throw error;
    }
  }

  /**
   * Get the training parameters and metadata stored for one finetune.
   *
   * @param finetuneId - The finetune to describe
   * @returns Finetune details
   *
   * @example
   * const { finetune_details } = await api.getFinetuneDetails('my-finetune');
   */
  async getFinetuneDetails(finetuneId: string): Promise<FinetuneDetailsResult> {
    this._verifyApiKey();
    if (!finetuneId) {
      throw new Error('finetuneId is required');
    }

    try {
      const result = await this._makeRequest<FinetuneDetailsResult>(
        'GET',
        `/v1/finetune_details?finetune_id=${encodeURIComponent(finetuneId)}`
      );
      this.logger.info(`Fetched details for finetune ${finetuneId}`);
      return result;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Error fetching finetune details: ${err.message}`);
      throw error;
    }
  }

  /**
   * Delete a finetune created by the user. Irreversible.
   *
   * @param finetuneId - The finetune to delete
   * @returns Deletion confirmation
   *
   * @example
   * const { status, deleted_finetune_id } = await api.deleteFinetune('my-finetune');
   */
  async deleteFinetune(finetuneId: string): Promise<DeleteFinetuneResult> {
    this._verifyApiKey();
    if (!finetuneId) {
      throw new Error('finetuneId is required');
    }

    try {
      const result = await this._makeRequest<DeleteFinetuneResult>('POST', '/v1/delete_finetune', {
        finetune_id: finetuneId,
      });
      this.logger.info(`Deleted finetune ${result.deleted_finetune_id}`);
      return result;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Error deleting finetune: ${err.message}`);
      throw error;
    }
  }
}

export default BflAPI;

export { BflHttpError, BflNetworkError, BflTimeoutError } from './http.js';

// Re-export types for consumer convenience
export type {
  BflApiOptions,
  TaskResult,
  TaskStatus,
  SubmitResult,
  CreditsResult,
  FinetunesResult,
  FinetuneDetailsResult,
  DeleteFinetuneResult,
  WaitResultOptions,
  CommonRequestFields,
  OutputFormat,
  MediaKind,
  ModelInfo,
  FluxDevParams,
  FluxProParams,
  FluxProUltraParams,
  FluxProUltraFinetunedParams,
  FluxProFillParams,
  FluxProFillFinetunedParams,
  FluxProExpandParams,
  KontextProParams,
  KontextMaxParams,
  Flux2Params,
  Flux2ProParams,
  Flux2FlexParams,
  Flux2KleinParams,
  FluxDeblurParams,
  FluxEraseParams,
  FluxOutpaintParams,
  FluxVtoParams,
  Flux3VideoParams,
  Flux3VideoMode,
  Flux3VideoT2VParams,
  Flux3VideoI2VParams,
  Flux3VideoV2VParams,
  Flux3VideoDraftEnhanceParams,
  VideoKeyframe,
  VideoAspectRatio,
  VideoResolution,
  FluxVideoEditParams,
  FluxVideoUpscaleParams,
  ValidationResult,
  ModelConstraint,
  ModelEndpointKey,
} from './types/index.js';
