/**
 * Black Forest Labs API Wrapper
 *
 * Main API wrapper class for interacting with the BFL Image Generation API.
 * Provides methods for generating images using FLUX and Kontext models.
 *
 * All generation methods follow a consistent pattern:
 * 1. Verify API key is set
 * 2. Build request payload
 * 3. Submit generation request
 * 4. Return task object with ID and polling URL
 * 5. Optionally poll for completion with retry logic
 *
 * @example
 * const api = new BflAPI();
 * const task = await api.generateFluxDev({ prompt: 'a cat', width: 1024, height: 768 });
 * const result = await api.waitForResult(task.id);
 */

import axios, { type AxiosError } from 'axios';
import winston from 'winston';
import { getBflApiKey, BASE_URL, MODEL_ENDPOINTS, MAX_RETRIES } from './config.js';
import { pause, createSpinner } from './utils.js';
import type {
  BflApiOptions,
  TaskResult,
  CreditsResult,
  FinetunesResult,
  WaitResultOptions,
  FluxDevParams,
  FluxProParams,
  FluxProUltraParams,
  FluxProFillParams,
  FluxProFillFinetunedParams,
  FluxProExpandParams,
  KontextProParams,
  KontextMaxParams,
  Flux2Params,
  ModelEndpointKey,
  GenericErrorMessages,
} from './types/index.js';

/**
 * Wrapper class for Black Forest Labs Image Generation API.
 *
 * Provides methods to generate images using FLUX and Kontext models,
 * poll for results, and manage account credits.
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
   * @param error - Error object from axios
   * @param status - HTTP status code
   * @returns Sanitized error message
   */
  private _sanitizeErrorMessage(error: AxiosError, status: number): string {
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
    const responseData = error.response?.data as { detail?: unknown; error?: string } | undefined;
    const errorDetail = responseData?.detail || responseData?.error || error.message;

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
  private async _makeRequest(
    method: string,
    endpoint: string,
    data: Record<string, unknown> | null = null
  ): Promise<TaskResult | CreditsResult | FinetunesResult> {
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

    try {
      let response;

      // Request configuration with timeout and security settings
      const config = {
        headers,
        timeout: 30000, // 30 second timeout
        maxRedirects: 5, // Limit redirects to prevent redirect loops
      };

      if (method.toUpperCase() === 'GET') {
        response = await axios.get(url, config);
      } else if (method.toUpperCase() === 'POST') {
        response = await axios.post(url, data, config);
      } else {
        throw new Error(`Unsupported HTTP method: ${method}`);
      }

      this.logger.debug(`API request successful: ${method} ${endpoint}`);
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      this.logger.error(`API request failed: ${axiosError.message}`);

      // Enhanced error handling with sanitization
      if (axiosError.response) {
        const status = axiosError.response.status;
        const sanitizedMessage = this._sanitizeErrorMessage(axiosError, status);

        if (status === 401) {
          throw new Error('Authentication failed. Please check your API key.');
        } else if (status === 422) {
          throw new Error(`Invalid parameters: ${sanitizedMessage}`);
        } else if (status === 429) {
          throw new Error('Rate limit exceeded. Please wait before making more requests.');
        } else if (status === 502 || status === 503) {
          throw new Error(`Service temporarily unavailable (${status}). Please retry.`);
        } else {
          throw new Error(`HTTP ${status}: ${sanitizedMessage}`);
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
    modelLabel: string,
    payload: Record<string, unknown>
  ): Promise<TaskResult> {
    try {
      const result = (await this._makeRequest(
        'POST',
        MODEL_ENDPOINTS[modelKey],
        payload
      )) as TaskResult;
      this.logger.info(`${modelLabel} generation submitted: ${result.id}`);
      return result;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Error generating with ${modelLabel}: ${err.message}`);
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
  async generateFluxDev(params: FluxDevParams): Promise<TaskResult> {
    this._verifyApiKey();

    const payload: Record<string, unknown> = {
      prompt: params.prompt,
      width: params.width || 1024,
      height: params.height || 768,
      steps: params.steps || 28,
      guidance: params.guidance || 3,
      ...(params.seed !== undefined && { seed: params.seed }),
      ...(params.safety_tolerance !== undefined && { safety_tolerance: params.safety_tolerance }),
      ...(params.output_format && { output_format: params.output_format }),
      ...(params.prompt_upsampling !== undefined && {
        prompt_upsampling: params.prompt_upsampling,
      }),
    };

    return this._submitGeneration('flux-dev', 'FLUX.1 [dev]', payload);
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
  async generateFluxPro(params: FluxProParams): Promise<TaskResult> {
    this._verifyApiKey();

    const payload: Record<string, unknown> = {
      prompt: params.prompt,
      width: params.width || 1024,
      height: params.height || 768,
      ...(params.image_prompt && { image_prompt: params.image_prompt }),
      ...(params.seed !== undefined && { seed: params.seed }),
      ...(params.safety_tolerance !== undefined && { safety_tolerance: params.safety_tolerance }),
      ...(params.output_format && { output_format: params.output_format }),
      ...(params.prompt_upsampling !== undefined && {
        prompt_upsampling: params.prompt_upsampling,
      }),
    };

    return this._submitGeneration('flux-pro', 'FLUX 1.1 [pro]', payload);
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
  async generateFluxProUltra(params: FluxProUltraParams): Promise<TaskResult> {
    this._verifyApiKey();

    const payload: Record<string, unknown> = {
      prompt: params.prompt,
      aspect_ratio: params.aspect_ratio || '16:9',
      raw: params.raw || false,
      ...(params.image_prompt && { image_prompt: params.image_prompt }),
      ...(params.image_prompt_strength !== undefined && {
        image_prompt_strength: params.image_prompt_strength,
      }),
      ...(params.seed !== undefined && { seed: params.seed }),
      ...(params.safety_tolerance !== undefined && { safety_tolerance: params.safety_tolerance }),
      ...(params.output_format && { output_format: params.output_format }),
    };

    return this._submitGeneration('flux-ultra', 'FLUX 1.1 [pro] Ultra', payload);
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
  async generateFluxProFill(params: FluxProFillParams): Promise<TaskResult> {
    this._verifyApiKey();

    if (!params.image) {
      throw new Error('image is required for FLUX.1 Fill [pro]');
    }

    if (!params.prompt) {
      throw new Error('prompt is required for FLUX.1 Fill [pro]');
    }

    const payload: Record<string, unknown> = {
      image: params.image,
      prompt: params.prompt,
      ...(params.mask && { mask: params.mask }),
      ...(params.steps !== undefined && { steps: params.steps }),
      ...(params.guidance !== undefined && { guidance: params.guidance }),
      ...(params.seed !== undefined && { seed: params.seed }),
      ...(params.safety_tolerance !== undefined && { safety_tolerance: params.safety_tolerance }),
      ...(params.output_format && { output_format: params.output_format }),
      ...(params.prompt_upsampling !== undefined && {
        prompt_upsampling: params.prompt_upsampling,
      }),
    };

    return this._submitGeneration('flux-pro-fill', 'FLUX.1 Fill [pro]', payload);
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
  async generateFluxProFillFinetuned(params: FluxProFillFinetunedParams): Promise<TaskResult> {
    this._verifyApiKey();

    if (!params.finetune_id) {
      throw new Error('finetune_id is required for FLUX.1 Fill [pro] finetune');
    }

    if (!params.image) {
      throw new Error('image is required for FLUX.1 Fill [pro] finetune');
    }

    const payload: Record<string, unknown> = {
      finetune_id: params.finetune_id,
      image: params.image,
      prompt: params.prompt || '',
      ...(params.mask && { mask: params.mask }),
      ...(params.finetune_strength !== undefined && {
        finetune_strength: params.finetune_strength,
      }),
      ...(params.steps !== undefined && { steps: params.steps }),
      ...(params.guidance !== undefined && { guidance: params.guidance }),
      ...(params.seed !== undefined && { seed: params.seed }),
      ...(params.safety_tolerance !== undefined && { safety_tolerance: params.safety_tolerance }),
      ...(params.output_format && { output_format: params.output_format }),
      ...(params.prompt_upsampling !== undefined && {
        prompt_upsampling: params.prompt_upsampling,
      }),
    };

    return this._submitGeneration('flux-pro-fill-finetuned', 'FLUX.1 Fill [pro] finetune', payload);
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
  async generateFluxProExpand(params: FluxProExpandParams): Promise<TaskResult> {
    this._verifyApiKey();

    if (!params.image) {
      throw new Error('image is required for FLUX.1 Expand [pro]');
    }

    const payload: Record<string, unknown> = {
      image: params.image,
      ...(params.top !== undefined && { top: params.top }),
      ...(params.bottom !== undefined && { bottom: params.bottom }),
      ...(params.left !== undefined && { left: params.left }),
      ...(params.right !== undefined && { right: params.right }),
      ...(params.prompt && { prompt: params.prompt }),
      ...(params.steps !== undefined && { steps: params.steps }),
      ...(params.guidance !== undefined && { guidance: params.guidance }),
      ...(params.seed !== undefined && { seed: params.seed }),
      ...(params.safety_tolerance !== undefined && { safety_tolerance: params.safety_tolerance }),
      ...(params.output_format && { output_format: params.output_format }),
      ...(params.prompt_upsampling !== undefined && {
        prompt_upsampling: params.prompt_upsampling,
      }),
    };

    return this._submitGeneration('flux-pro-expand', 'FLUX.1 Expand [pro]', payload);
  }

  // ==================== Kontext Pro ====================

  /**
   * Generate image using Kontext Pro model.
   * Multi-reference image editing with context preservation.
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
  async generateKontextPro(params: KontextProParams): Promise<TaskResult> {
    this._verifyApiKey();

    if (!params.input_image) {
      throw new Error('input_image is required for Kontext Pro');
    }

    const payload: Record<string, unknown> = {
      prompt: params.prompt,
      input_image: params.input_image,
      ...(params.input_image_2 && { input_image_2: params.input_image_2 }),
      ...(params.input_image_3 && { input_image_3: params.input_image_3 }),
      ...(params.input_image_4 && { input_image_4: params.input_image_4 }),
      ...(params.seed !== undefined && { seed: params.seed }),
      ...(params.safety_tolerance !== undefined && { safety_tolerance: params.safety_tolerance }),
      ...(params.output_format && { output_format: params.output_format }),
    };

    return this._submitGeneration('kontext-pro', 'Kontext Pro', payload);
  }

  // ==================== Kontext Max ====================

  /**
   * Generate image using Kontext Max model.
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
  async generateKontextMax(params: KontextMaxParams): Promise<TaskResult> {
    this._verifyApiKey();

    if (!params.input_image) {
      throw new Error('input_image is required for Kontext Max');
    }

    const payload: Record<string, unknown> = {
      prompt: params.prompt,
      input_image: params.input_image,
      ...(params.input_image_2 && { input_image_2: params.input_image_2 }),
      ...(params.input_image_3 && { input_image_3: params.input_image_3 }),
      ...(params.input_image_4 && { input_image_4: params.input_image_4 }),
      ...(params.seed !== undefined && { seed: params.seed }),
      ...(params.safety_tolerance !== undefined && { safety_tolerance: params.safety_tolerance }),
      ...(params.output_format && { output_format: params.output_format }),
    };

    return this._submitGeneration('kontext-max', 'Kontext Max', payload);
  }

  // ==================== FLUX.2 MODELS ====================

  /**
   * Internal helper for FLUX.2 generation (shared by PRO and FLEX).
   */
  private async _generateFlux2(
    modelKey: ModelEndpointKey,
    modelLabel: string,
    params: Flux2Params
  ): Promise<TaskResult> {
    this._verifyApiKey();

    const payload: Record<string, unknown> = {
      prompt: params.prompt,
      ...(params.prompt_upsampling !== undefined
        ? { prompt_upsampling: params.prompt_upsampling }
        : { prompt_upsampling: true }),
      ...(params.width !== undefined && { width: params.width }),
      ...(params.height !== undefined && { height: params.height }),
      ...(params.input_image && { input_image: params.input_image }),
      ...(params.input_image_2 && { input_image_2: params.input_image_2 }),
      ...(params.input_image_3 && { input_image_3: params.input_image_3 }),
      ...(params.input_image_4 && { input_image_4: params.input_image_4 }),
      ...(params.input_image_5 && { input_image_5: params.input_image_5 }),
      ...(params.input_image_6 && { input_image_6: params.input_image_6 }),
      ...(params.input_image_7 && { input_image_7: params.input_image_7 }),
      ...(params.input_image_8 && { input_image_8: params.input_image_8 }),
      ...(params.seed !== undefined && { seed: params.seed }),
      ...(params.safety_tolerance !== undefined && { safety_tolerance: params.safety_tolerance }),
      ...(params.output_format && { output_format: params.output_format }),
    };

    return this._submitGeneration(modelKey, modelLabel, payload);
  }

  /**
   * Generate or edit image using FLUX.2 [PRO] model.
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
   * // Image editing with context
   * const task = await api.generateFlux2Pro({
   *   prompt: 'Add a dragon flying above the castle',
   *   input_image: 'base64_or_url_of_castle_image'
   * });
   */
  async generateFlux2Pro(params: Flux2Params): Promise<TaskResult> {
    return this._generateFlux2('flux-2-pro', 'FLUX.2 [PRO]', params);
  }

  /**
   * Generate or edit image using FLUX.2 [FLEX] model.
   * Supports multi-image input for contextual generation and editing.
   *
   * @param params - Generation parameters
   * @returns Task object with id, polling_url, cost, input_mp, output_mp
   *
   * @example
   * // Text-to-image generation
   * const task = await api.generateFlux2Flex({
   *   prompt: 'A serene Japanese garden',
   *   width: 1024,
   *   height: 768
   * });
   *
   * @example
   * // Image editing with multiple references
   * const task = await api.generateFlux2Flex({
   *   prompt: 'Combine the style and subject',
   *   input_image: 'base64_or_url_of_subject',
   *   input_image_2: 'base64_or_url_of_style_ref'
   * });
   */
  async generateFlux2Flex(params: Flux2Params): Promise<TaskResult> {
    return this._generateFlux2('flux-2-flex', 'FLUX.2 [FLEX]', params);
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Get result for a specific task ID.
   * Polls the task once and returns current status.
   *
   * @param taskId - Task ID to poll
   * @param pollingUrl - Optional full polling URL (if not provided, constructs default)
   * @returns Task result object
   *
   * @example
   * const result = await api.getResult('abc123');
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

        const response = await axios.get<TaskResult>(pollingUrl, { headers });
        result = response.data;
      } else {
        // Fallback to constructing URL
        result = (await this._makeRequest('GET', `/v1/get_result?id=${taskId}`)) as TaskResult;
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
   * Wait for task to complete with polling, spinner, and retry logic.
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
            const errorMsg = result.result?.error || 'Unknown error';
            throw new Error(`Generation failed: ${errorMsg}`);
          } else if (result.status === 'Content Moderated') {
            throw new Error('Content was moderated. Please revise your prompt.');
          } else if (result.status === 'Pending' || result.status === 'Request Moderated') {
            // Continue polling
            if (spinner) {
              const timeLeft = Math.max(0, timeout - elapsed).toFixed(0);
              spinner.update(
                `Generating... ${result.status} (${elapsed.toFixed(0)}s elapsed, ~${timeLeft}s remaining)`
              );
            }
          }

          // Reset retry count on successful poll
          retries = 0;
        } catch (error) {
          const err = error as Error;
          // Check if this is a transient error we should retry
          const isTransient =
            err.message.includes('503') ||
            err.message.includes('502') ||
            err.message.includes('ECONNRESET') ||
            err.message.includes('ETIMEDOUT');

          // Don't retry moderation errors
          const isModeration =
            err.message.includes('moderated') || err.message.includes('Content Moderated');

          if (isModeration) {
            throw error; // Don't retry moderation errors
          }

          if (isTransient && retries < maxRetries) {
            retries++;
            const backoff = Math.pow(2, retries); // Exponential backoff: 2s, 4s, 8s
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
      const result = (await this._makeRequest('GET', '/v1/credits')) as CreditsResult;
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
      const result = (await this._makeRequest('GET', '/v1/my_finetunes')) as FinetunesResult;
      const count = result.finetunes?.length || 0;
      this.logger.info(`Found ${count} fine-tuned model(s)`);
      return result;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Error fetching finetunes: ${err.message}`);
      throw error;
    }
  }
}

export default BflAPI;

// Re-export types for consumer convenience
export type {
  BflApiOptions,
  TaskResult,
  CreditsResult,
  FinetunesResult,
  WaitResultOptions,
  FluxDevParams,
  FluxProParams,
  FluxProUltraParams,
  FluxProFillParams,
  FluxProFillFinetunedParams,
  FluxProExpandParams,
  KontextProParams,
  KontextMaxParams,
  Flux2Params,
  ValidationResult,
  ModelConstraint,
} from './types/index.js';
