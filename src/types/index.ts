/**
 * BFL API Type Definitions
 *
 * Comprehensive TypeScript types for the Black Forest Labs API wrapper.
 */

// ==================== API CONFIGURATION TYPES ====================

/**
 * Options for initializing the BflAPI class.
 */
export interface BflApiOptions {
  /** BFL API key. If null, reads from environment variable. */
  apiKey?: string | null;
  /** API base URL (default: https://api.bfl.ai) */
  baseUrl?: string;
  /** Logging level (DEBUG, INFO, WARNING, ERROR, NONE) */
  logLevel?: string;
}

/**
 * Model endpoint mappings.
 */
export type ModelEndpointKey =
  | 'flux-dev'
  | 'flux-pro'
  | 'flux-ultra'
  | 'flux-pro-fill'
  | 'flux-pro-fill-finetuned'
  | 'flux-pro-expand'
  | 'kontext-pro'
  | 'kontext-max'
  | 'flux-2-pro'
  | 'flux-2-flex';

export type ModelEndpoints = {
  [K in ModelEndpointKey]: string;
};

// ==================== MODEL CONSTRAINT TYPES ====================

/**
 * Range constraint for numeric parameters.
 */
export interface RangeConstraint {
  min: number;
  max: number;
}

/**
 * Dimension constraint with divisibility requirement.
 */
export interface DimensionConstraint extends RangeConstraint {
  divisibleBy: number;
}

/**
 * Constraints for a specific model.
 */
export interface ModelConstraint {
  width?: DimensionConstraint;
  height?: DimensionConstraint;
  steps?: RangeConstraint;
  guidance?: RangeConstraint;
  aspectRatios?: string[];
  raw?: boolean[];
  imagePromptStrength?: RangeConstraint;
  safetyTolerance?: RangeConstraint;
  finetuneStrength?: RangeConstraint;
  outputFormats?: string[];
  promptMaxLength?: number;
  maxInputImages?: number;
  top?: RangeConstraint;
  bottom?: RangeConstraint;
  left?: RangeConstraint;
  right?: RangeConstraint;
}

/**
 * All model constraints mapped by model key.
 */
export type ModelConstraints = {
  [K in ModelEndpointKey]: ModelConstraint;
};

// ==================== GENERATION PARAMETER TYPES ====================

/**
 * Base parameters common to most generation methods.
 */
export interface BaseGenerationParams {
  /** Text description of desired image (required) */
  prompt: string;
  /** Random seed for reproducibility */
  seed?: number;
  /** Content moderation level (0-6) */
  safety_tolerance?: number;
  /** Output format: 'jpeg' or 'png' */
  output_format?: string;
}

/**
 * Parameters for FLUX.1 [dev] model generation.
 */
export interface FluxDevParams extends BaseGenerationParams {
  /** Image width in pixels (256-1440, multiple of 32) */
  width?: number;
  /** Image height in pixels (256-1440, multiple of 32) */
  height?: number;
  /** Number of inference steps (1-50) */
  steps?: number;
  /** Guidance scale (1.5-5) */
  guidance?: number;
  /** Enable AI prompt enhancement */
  prompt_upsampling?: boolean;
}

/**
 * Parameters for FLUX 1.1 [pro] model generation.
 */
export interface FluxProParams extends BaseGenerationParams {
  /** Image width in pixels (256-1440, multiple of 32) */
  width?: number;
  /** Image height in pixels (256-1440, multiple of 32) */
  height?: number;
  /** Input image as base64 or URL for Redux */
  image_prompt?: string;
  /** Enable AI prompt enhancement */
  prompt_upsampling?: boolean;
}

/**
 * Parameters for FLUX 1.1 [pro] Ultra model generation.
 */
export interface FluxProUltraParams extends BaseGenerationParams {
  /** Aspect ratio (21:9 to 9:21) */
  aspect_ratio?: string;
  /** Enable raw/natural mode */
  raw?: boolean;
  /** Input image as base64 or URL for remixing */
  image_prompt?: string;
  /** Remix strength (0-1) */
  image_prompt_strength?: number;
}

/**
 * Parameters for FLUX.1 Fill [pro] model generation.
 */
export interface FluxProFillParams extends BaseGenerationParams {
  /** Input image as base64 or file path (required) */
  image: string;
  /** Binary mask as base64 or file path */
  mask?: string;
  /** Number of inference steps (15-50) */
  steps?: number;
  /** Guidance scale (1.5-100) */
  guidance?: number;
  /** Enable AI prompt enhancement */
  prompt_upsampling?: boolean;
}

/**
 * Parameters for FLUX.1 Fill [pro] with fine-tuned model.
 */
export interface FluxProFillFinetunedParams extends FluxProFillParams {
  /** ID of the fine-tuned model (required) */
  finetune_id: string;
  /** Finetune strength (0.0-2.0) */
  finetune_strength?: number;
}

/**
 * Parameters for FLUX.1 Expand [pro] model generation.
 */
export interface FluxProExpandParams extends Omit<BaseGenerationParams, 'prompt'> {
  /** Input image as base64 or file path (required) */
  image: string;
  /** Description of desired expansion */
  prompt?: string;
  /** Pixels to expand at top (0-2048) */
  top?: number;
  /** Pixels to expand at bottom (0-2048) */
  bottom?: number;
  /** Pixels to expand on left (0-2048) */
  left?: number;
  /** Pixels to expand on right (0-2048) */
  right?: number;
  /** Number of inference steps (15-50) */
  steps?: number;
  /** Guidance scale (1.5-100) */
  guidance?: number;
  /** Enable AI prompt enhancement */
  prompt_upsampling?: boolean;
}

/**
 * Parameters for Kontext Pro model generation.
 */
export interface KontextProParams extends BaseGenerationParams {
  /** Primary input image as base64 or URL (required) */
  input_image: string;
  /** Additional reference image */
  input_image_2?: string;
  /** Additional reference image */
  input_image_3?: string;
  /** Additional reference image */
  input_image_4?: string;
}

/**
 * Parameters for Kontext Max model generation.
 */
export interface KontextMaxParams extends KontextProParams {}

/**
 * Parameters for FLUX.2 models (Pro and Flex).
 */
export interface Flux2Params extends BaseGenerationParams {
  /** Image width (64-2048, multiple of 16) */
  width?: number;
  /** Image height (64-2048, multiple of 16) */
  height?: number;
  /** Primary input image as base64 or URL */
  input_image?: string;
  /** Additional input image */
  input_image_2?: string;
  /** Additional input image */
  input_image_3?: string;
  /** Additional input image */
  input_image_4?: string;
  /** Additional input image (experimental multiref) */
  input_image_5?: string;
  /** Additional input image (experimental multiref) */
  input_image_6?: string;
  /** Additional input image (experimental multiref) */
  input_image_7?: string;
  /** Additional input image (experimental multiref) */
  input_image_8?: string;
  /** Enable AI prompt enhancement */
  prompt_upsampling?: boolean;
}

// ==================== RESPONSE TYPES ====================

/**
 * Task result from generation or polling.
 */
export interface TaskResult {
  /** Task ID */
  id: string;
  /** Task status */
  status: 'Ready' | 'Pending' | 'Error' | 'Content Moderated' | 'Request Moderated';
  /** Polling URL for checking status */
  polling_url?: string;
  /** Result data when complete */
  result?: {
    /** Generated image URL */
    sample?: string;
    /** Error message if failed */
    error?: string;
  };
  /** Cost in credits (FLUX.2 models) */
  cost?: number;
  /** Input megapixels (FLUX.2 models) */
  input_mp?: number;
  /** Output megapixels (FLUX.2 models) */
  output_mp?: number;
}

/**
 * User credits information.
 */
export interface CreditsResult {
  /** Credits remaining */
  credits: number;
}

/**
 * User fine-tuned models information.
 */
export interface FinetunesResult {
  /** Array of finetune IDs */
  finetunes: string[];
}

/**
 * Validation result from parameter validation.
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Array of error messages */
  errors: string[];
}

// ==================== POLLING OPTIONS ====================

/**
 * Options for waitForResult polling.
 */
export interface WaitResultOptions {
  /** Full polling URL from task response */
  pollingUrl?: string | null;
  /** Maximum wait time in seconds */
  timeout?: number;
  /** Seconds between polls */
  pollInterval?: number;
  /** Maximum retries on transient errors */
  maxRetries?: number;
  /** Show animated spinner */
  showSpinner?: boolean;
}

// ==================== UTILITY TYPES ====================

/**
 * Spinner object for long-running operations.
 */
export interface SpinnerObject {
  /** Start the spinner animation */
  start(): void;
  /** Stop the spinner and optionally show final message */
  stop(finalMessage?: string | null): void;
  /** Update the spinner message */
  update(newMessage: string): void;
}

/**
 * Constraints for image file validation.
 */
export interface ImageValidationConstraints {
  /** Maximum file size in bytes */
  maxSize?: number;
  /** Allowed file formats (e.g., ['png', 'jpg', 'jpeg']) */
  formats?: string[];
}

/**
 * Result from image file validation.
 */
export interface ImageFileValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Array of error messages */
  errors: string[];
}

/**
 * File format for read/write operations.
 */
export type FileFormat = 'json' | 'txt' | 'binary' | 'auto';

// ==================== HTTP TYPES ====================

/**
 * HTTP method types.
 */
export type HttpMethod = 'GET' | 'POST';

/**
 * Generic error status codes with messages.
 */
export interface GenericErrorMessages {
  [statusCode: number]: string;
}
