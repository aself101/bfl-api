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

import axios from 'axios';
import winston from 'winston';
import { getBflApiKey, BASE_URL, MODEL_ENDPOINTS, MAX_RETRIES } from './config.js';
import { pause, createSpinner } from './utils.js';

/**
 * Wrapper class for Black Forest Labs Image Generation API.
 *
 * Provides methods to generate images using FLUX and Kontext models,
 * poll for results, and manage account credits.
 */
export class BflAPI {
  /**
   * Initialize BflAPI instance.
   *
   * @param {Object} options - Configuration options
   * @param {string} options.apiKey - BFL API key. If null, reads from environment variable.
   * @param {string} options.baseUrl - API base URL (default: https://api.bfl.ai)
   * @param {string} options.logLevel - Logging level (DEBUG, INFO, WARNING, ERROR)
   *
   * @throws {Error} If API key is not provided and not in environment
   */
  constructor({ apiKey = null, baseUrl = BASE_URL, logLevel = 'INFO' } = {}) {
    // Setup logging
    this.logger = winston.createLogger({
      level: logLevel.toLowerCase(),
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
   * @throws {Error} If API key is not set
   */
  _verifyApiKey() {
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
   * @param {string} apiKey - API key to redact
   * @returns {string} Redacted API key (e.g., "xxx...abc1234")
   * @private
   */
  _redactApiKey(apiKey) {
    if (!apiKey || apiKey.length < 8) {
      return '[REDACTED]';
    }
    return `xxx...${apiKey.slice(-4)}`;
  }

  /**
   * Sanitize error messages for production environments.
   * Returns generic messages in production to avoid information disclosure.
   *
   * @param {Error} error - Error object from axios
   * @param {number} status - HTTP status code
   * @returns {string} Sanitized error message
   * @private
   */
  _sanitizeErrorMessage(error, status) {
    // In production, return generic messages to avoid information disclosure
    if (process.env.NODE_ENV === 'production') {
      const genericMessages = {
        400: 'Invalid request parameters',
        401: 'Authentication failed',
        403: 'Access forbidden',
        404: 'Resource not found',
        422: 'Invalid parameters',
        429: 'Rate limit exceeded',
        500: 'Service error',
        502: 'Service temporarily unavailable',
        503: 'Service temporarily unavailable'
      };

      return genericMessages[status] || 'An error occurred';
    }

    // In development, return detailed error messages
    const errorDetail = error.response?.data?.detail || error.response?.data?.error || error.message;

    // If errorDetail is an object, stringify it
    if (typeof errorDetail === 'object' && errorDetail !== null) {
      return JSON.stringify(errorDetail);
    }

    return errorDetail;
  }

  /**
   * Make HTTP request to BFL API.
   *
   * @param {string} method - HTTP method (GET, POST)
   * @param {string} endpoint - API endpoint path
   * @param {Object} data - Request payload
   * @returns {Promise<Object>} JSON response from API
   *
   * @throws {Error} If request fails
   */
  async _makeRequest(method, endpoint, data = null) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'accept': 'application/json',
      'x-key': this.apiKey,
      'Content-Type': 'application/json'
    };

    // Sanitized headers for logging (redact API key)
    const sanitizedHeaders = {
      ...headers,
      'x-key': this._redactApiKey(this.apiKey)
    };

    this.logger.debug(`API request: ${method} ${endpoint}`, { headers: sanitizedHeaders });

    try {
      let response;

      // Request configuration with timeout and security settings
      const config = {
        headers,
        timeout: 30000,        // 30 second timeout
        maxRedirects: 5,       // Limit redirects to prevent redirect loops
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
      this.logger.error(`API request failed: ${error.message}`);

      // Enhanced error handling with sanitization
      if (error.response) {
        const status = error.response.status;
        const sanitizedMessage = this._sanitizeErrorMessage(error, status);

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

  // ==================== FLUX.1 [dev] ====================

  /**
   * Generate image using FLUX.1 [dev] model.
   * Provides full control over inference steps and guidance scale.
   *
   * @param {Object} params - Generation parameters
   * @param {string} params.prompt - Text description of desired image (required)
   * @param {number} params.width - Image width in pixels (256-1440, multiple of 32, default: 1024)
   * @param {number} params.height - Image height in pixels (256-1440, multiple of 32, default: 768)
   * @param {number} params.steps - Number of inference steps (1-50, default: 28)
   * @param {number} params.guidance - Guidance scale (1.5-5, default: 3)
   * @param {number} params.seed - Random seed for reproducibility (optional)
   * @param {number} params.safety_tolerance - Content moderation level (0-6, default: 2)
   * @param {string} params.output_format - Output format: 'jpeg' or 'png' (default: 'jpeg')
   * @param {boolean} params.prompt_upsampling - Enable AI prompt enhancement (default: false)
   * @returns {Promise<Object>} Task object with id and polling_url
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
  async generateFluxDev(params) {
    this._verifyApiKey();

    const payload = {
      prompt: params.prompt,
      width: params.width || 1024,
      height: params.height || 768,
      steps: params.steps || 28,
      guidance: params.guidance || 3,
      ...(params.seed !== undefined && { seed: params.seed }),
      ...(params.safety_tolerance !== undefined && { safety_tolerance: params.safety_tolerance }),
      ...(params.output_format && { output_format: params.output_format }),
      ...(params.prompt_upsampling !== undefined && { prompt_upsampling: params.prompt_upsampling })
    };

    try {
      const result = await this._makeRequest('POST', MODEL_ENDPOINTS['flux-dev'], payload);
      this.logger.info(`FLUX.1 [dev] generation submitted: ${result.id}`);
      return result;
    } catch (error) {
      this.logger.error(`Error generating with FLUX.1 [dev]: ${error.message}`);
      throw error;
    }
  }

  // ==================== FLUX 1.1 [pro] ====================

  /**
   * Generate image using FLUX 1.1 [pro] model.
   * Professional quality with Redux image prompting support.
   *
   * @param {Object} params - Generation parameters
   * @param {string} params.prompt - Text description of desired image (required)
   * @param {number} params.width - Image width in pixels (256-1440, multiple of 32, default: 1024)
   * @param {number} params.height - Image height in pixels (256-1440, multiple of 32, default: 768)
   * @param {string} params.image_prompt - Input image as base64 or URL for Redux (optional)
   * @param {number} params.seed - Random seed for reproducibility (optional)
   * @param {number} params.safety_tolerance - Content moderation level (0-6, default: 2)
   * @param {string} params.output_format - Output format: 'jpeg' or 'png' (default: 'jpeg')
   * @param {boolean} params.prompt_upsampling - Enable AI prompt enhancement (default: false)
   * @returns {Promise<Object>} Task object with id and polling_url
   *
   * @example
   * const task = await api.generateFluxPro({
   *   prompt: 'A modern office interior',
   *   width: 1024,
   *   height: 1024,
   *   image_prompt: 'base64_encoded_image_string'
   * });
   */
  async generateFluxPro(params) {
    this._verifyApiKey();

    const payload = {
      prompt: params.prompt,
      width: params.width || 1024,
      height: params.height || 768,
      ...(params.image_prompt && { image_prompt: params.image_prompt }),
      ...(params.seed !== undefined && { seed: params.seed }),
      ...(params.safety_tolerance !== undefined && { safety_tolerance: params.safety_tolerance }),
      ...(params.output_format && { output_format: params.output_format }),
      ...(params.prompt_upsampling !== undefined && { prompt_upsampling: params.prompt_upsampling })
    };

    try {
      const result = await this._makeRequest('POST', MODEL_ENDPOINTS['flux-pro'], payload);
      this.logger.info(`FLUX 1.1 [pro] generation submitted: ${result.id}`);
      return result;
    } catch (error) {
      this.logger.error(`Error generating with FLUX 1.1 [pro]: ${error.message}`);
      throw error;
    }
  }

  // ==================== FLUX 1.1 [pro] Ultra ====================

  /**
   * Generate image using FLUX 1.1 [pro] Ultra model.
   * Maximum quality with aspect ratio control and raw mode.
   *
   * @param {Object} params - Generation parameters
   * @param {string} params.prompt - Text description of desired image (required)
   * @param {string} params.aspect_ratio - Aspect ratio (21:9 to 9:21, default: '16:9')
   * @param {boolean} params.raw - Enable raw/natural mode (default: false)
   * @param {string} params.image_prompt - Input image as base64 or URL for remixing (optional)
   * @param {number} params.image_prompt_strength - Remix strength (0-1, default: 0.1)
   * @param {number} params.seed - Random seed for reproducibility (optional)
   * @param {number} params.safety_tolerance - Content moderation level (0-6, default: 2)
   * @param {string} params.output_format - Output format: 'jpeg' or 'png' (default: 'jpeg')
   * @returns {Promise<Object>} Task object with id and polling_url
   *
   * @example
   * const task = await api.generateFluxProUltra({
   *   prompt: 'Cinematic landscape photography',
   *   aspect_ratio: '21:9',
   *   raw: true
   * });
   */
  async generateFluxProUltra(params) {
    this._verifyApiKey();

    const payload = {
      prompt: params.prompt,
      aspect_ratio: params.aspect_ratio || '16:9',
      raw: params.raw || false,
      ...(params.image_prompt && { image_prompt: params.image_prompt }),
      ...(params.image_prompt_strength !== undefined && { image_prompt_strength: params.image_prompt_strength }),
      ...(params.seed !== undefined && { seed: params.seed }),
      ...(params.safety_tolerance !== undefined && { safety_tolerance: params.safety_tolerance }),
      ...(params.output_format && { output_format: params.output_format })
    };

    try {
      const result = await this._makeRequest('POST', MODEL_ENDPOINTS['flux-ultra'], payload);
      this.logger.info(`FLUX 1.1 [pro] Ultra generation submitted: ${result.id}`);
      return result;
    } catch (error) {
      this.logger.error(`Error generating with FLUX 1.1 [pro] Ultra: ${error.message}`);
      throw error;
    }
  }

  // ==================== FLUX.1 Fill [pro] ====================

  /**
   * Generate image using FLUX.1 Fill [pro] model.
   * Inpainting - modify specific areas of images using masks.
   *
   * @param {Object} params - Generation parameters
   * @param {string} params.image - Input image as base64 or file path (required)
   * @param {string} params.prompt - Text description of desired modifications (required)
   * @param {string} params.mask - Binary mask as base64 or file path (optional, auto-generated if not provided)
   * @param {number} params.steps - Number of inference steps (15-50, default: 30)
   * @param {number} params.guidance - Guidance scale (1.5-100, default: 3)
   * @param {number} params.seed - Random seed for reproducibility (optional)
   * @param {number} params.safety_tolerance - Content moderation level (0-6, default: 2)
   * @param {string} params.output_format - Output format: 'jpeg' or 'png' (default: 'jpeg')
   * @param {boolean} params.prompt_upsampling - Enable AI prompt enhancement (default: false)
   * @returns {Promise<Object>} Task object with id and polling_url
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
  async generateFluxProFill(params) {
    this._verifyApiKey();

    if (!params.image) {
      throw new Error('image is required for FLUX.1 Fill [pro]');
    }

    if (!params.prompt) {
      throw new Error('prompt is required for FLUX.1 Fill [pro]');
    }

    const payload = {
      image: params.image,
      prompt: params.prompt,
      ...(params.mask && { mask: params.mask }),
      ...(params.steps !== undefined && { steps: params.steps }),
      ...(params.guidance !== undefined && { guidance: params.guidance }),
      ...(params.seed !== undefined && { seed: params.seed }),
      ...(params.safety_tolerance !== undefined && { safety_tolerance: params.safety_tolerance }),
      ...(params.output_format && { output_format: params.output_format }),
      ...(params.prompt_upsampling !== undefined && { prompt_upsampling: params.prompt_upsampling })
    };

    try {
      const result = await this._makeRequest('POST', MODEL_ENDPOINTS['flux-pro-fill'], payload);
      this.logger.info(`FLUX.1 Fill [pro] generation submitted: ${result.id}`);
      return result;
    } catch (error) {
      this.logger.error(`Error generating with FLUX.1 Fill [pro]: ${error.message}`);
      throw error;
    }
  }

  // ==================== Kontext Pro ====================

  /**
   * Generate image using Kontext Pro model.
   * Multi-reference image editing with context preservation.
   *
   * @param {Object} params - Generation parameters
   * @param {string} params.prompt - Text description of desired edits (required)
   * @param {string} params.input_image - Primary input image as base64 or URL (required)
   * @param {string} params.input_image_2 - Additional reference image (optional)
   * @param {string} params.input_image_3 - Additional reference image (optional)
   * @param {string} params.input_image_4 - Additional reference image (optional)
   * @param {number} params.seed - Random seed for reproducibility (optional)
   * @param {number} params.safety_tolerance - Content moderation level (0-6, default: 2)
   * @param {string} params.output_format - Output format: 'jpeg' or 'png' (default: 'jpeg')
   * @returns {Promise<Object>} Task object with id and polling_url
   *
   * @example
   * const task = await api.generateKontextPro({
   *   prompt: 'A small furry elephant pet looks out from a cat house',
   *   input_image: 'base64_encoded_image_string'
   * });
   */
  async generateKontextPro(params) {
    this._verifyApiKey();

    if (!params.input_image) {
      throw new Error('input_image is required for Kontext Pro');
    }

    const payload = {
      prompt: params.prompt,
      input_image: params.input_image,
      ...(params.input_image_2 && { input_image_2: params.input_image_2 }),
      ...(params.input_image_3 && { input_image_3: params.input_image_3 }),
      ...(params.input_image_4 && { input_image_4: params.input_image_4 }),
      ...(params.seed !== undefined && { seed: params.seed }),
      ...(params.safety_tolerance !== undefined && { safety_tolerance: params.safety_tolerance }),
      ...(params.output_format && { output_format: params.output_format })
    };

    try {
      const result = await this._makeRequest('POST', MODEL_ENDPOINTS['kontext-pro'], payload);
      this.logger.info(`Kontext Pro generation submitted: ${result.id}`);
      return result;
    } catch (error) {
      this.logger.error(`Error generating with Kontext Pro: ${error.message}`);
      throw error;
    }
  }

  // ==================== Kontext Max ====================

  /**
   * Generate image using Kontext Max model.
   * Maximum quality multi-reference image editing.
   *
   * @param {Object} params - Generation parameters
   * @param {string} params.prompt - Text description of desired edits (required)
   * @param {string} params.input_image - Primary input image as base64 or URL (required)
   * @param {string} params.input_image_2 - Additional reference image (optional)
   * @param {string} params.input_image_3 - Additional reference image (optional)
   * @param {string} params.input_image_4 - Additional reference image (optional)
   * @param {number} params.seed - Random seed for reproducibility (optional)
   * @param {number} params.safety_tolerance - Content moderation level (0-6, default: 2)
   * @param {string} params.output_format - Output format: 'jpeg' or 'png' (default: 'jpeg')
   * @returns {Promise<Object>} Task object with id and polling_url
   *
   * @example
   * const task = await api.generateKontextMax({
   *   prompt: 'Transform into a watercolor painting style',
   *   input_image: 'base64_encoded_image_string'
   * });
   */
  async generateKontextMax(params) {
    this._verifyApiKey();

    if (!params.input_image) {
      throw new Error('input_image is required for Kontext Max');
    }

    const payload = {
      prompt: params.prompt,
      input_image: params.input_image,
      ...(params.input_image_2 && { input_image_2: params.input_image_2 }),
      ...(params.input_image_3 && { input_image_3: params.input_image_3 }),
      ...(params.input_image_4 && { input_image_4: params.input_image_4 }),
      ...(params.seed !== undefined && { seed: params.seed }),
      ...(params.safety_tolerance !== undefined && { safety_tolerance: params.safety_tolerance }),
      ...(params.output_format && { output_format: params.output_format })
    };

    try {
      const result = await this._makeRequest('POST', MODEL_ENDPOINTS['kontext-max'], payload);
      this.logger.info(`Kontext Max generation submitted: ${result.id}`);
      return result;
    } catch (error) {
      this.logger.error(`Error generating with Kontext Max: ${error.message}`);
      throw error;
    }
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Get result for a specific task ID.
   * Polls the task once and returns current status.
   *
   * @param {string} taskId - Task ID to poll
   * @param {string} pollingUrl - Optional full polling URL (if not provided, constructs default)
   * @returns {Promise<Object>} Task result object
   *
   * @example
   * const result = await api.getResult('abc123');
   * if (result.status === 'Ready') {
   *   console.log('Image URL:', result.result.sample);
   * }
   */
  async getResult(taskId, pollingUrl = null) {
    this._verifyApiKey();

    try {
      let result;

      if (pollingUrl) {
        // Use the full polling URL provided by the API
        const headers = {
          'accept': 'application/json',
          'x-key': this.apiKey
        };

        const response = await axios.get(pollingUrl, { headers });
        result = response.data;
      } else {
        // Fallback to constructing URL
        result = await this._makeRequest('GET', `/v1/get_result?id=${taskId}`);
      }

      this.logger.debug(`Polled task ${taskId}: ${result.status}`);
      return result;
    } catch (error) {
      this.logger.error(`Error polling task ${taskId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Wait for task to complete with polling, spinner, and retry logic.
   *
   * @param {string} taskId - Task ID to wait for
   * @param {Object} options - Polling options
   * @param {string} options.pollingUrl - Optional full polling URL from task response
   * @param {number} options.timeout - Maximum wait time in seconds (default: 300)
   * @param {number} options.pollInterval - Seconds between polls (default: 2)
   * @param {number} options.maxRetries - Maximum retries on transient errors (default: 3)
   * @param {boolean} options.showSpinner - Show animated spinner (default: true)
   * @returns {Promise<Object>} Completed task result
   *
   * @throws {Error} If task fails, times out, or max retries exceeded
   *
   * @example
   * const result = await api.waitForResult('abc123', {
   *   pollingUrl: 'https://api.eu2.bfl.ai/v1/get_result?id=abc123',
   *   timeout: 300,
   *   pollInterval: 2,
   *   showSpinner: true
   * });
   */
  async waitForResult(taskId, {
    pollingUrl = null,
    timeout = 300,
    pollInterval = 2,
    maxRetries = MAX_RETRIES,
    showSpinner = true
  } = {}) {
    const startTime = Date.now();
    let retries = 0;
    let spinner = null;

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
              spinner.update(`Generating... ${result.status} (${elapsed.toFixed(0)}s elapsed, ~${timeLeft}s remaining)`);
            }
          }

          // Reset retry count on successful poll
          retries = 0;

        } catch (error) {
          // Check if this is a transient error we should retry
          const isTransient = error.message.includes('503') ||
                            error.message.includes('502') ||
                            error.message.includes('ECONNRESET') ||
                            error.message.includes('ETIMEDOUT');

          // Don't retry moderation errors
          const isModeration = error.message.includes('moderated') ||
                              error.message.includes('Content Moderated');

          if (isModeration) {
            throw error; // Don't retry moderation errors
          }

          if (isTransient && retries < maxRetries) {
            retries++;
            const backoff = Math.pow(2, retries); // Exponential backoff: 2s, 4s, 8s
            this.logger.warn(`Transient error (retry ${retries}/${maxRetries}): ${error.message}`);
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
   * @returns {Promise<Object>} Credits information
   *
   * @example
   * const credits = await api.getUserCredits();
   * console.log('Credits remaining:', credits.credits);
   */
  async getUserCredits() {
    this._verifyApiKey();

    try {
      const result = await this._makeRequest('GET', '/v1/credits');
      this.logger.info(`User credits: ${result.credits}`);
      return result;
    } catch (error) {
      this.logger.error(`Error fetching user credits: ${error.message}`);
      throw error;
    }
  }
}

export default BflAPI;

/* END */
