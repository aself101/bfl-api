/**
 * BFL API Type Definitions
 *
 * Comprehensive TypeScript types for the Black Forest Labs API wrapper.
 *
 * Parameter types mirror the request schemas published at
 * https://api.bfl.ai/openapi.json (snapshot: docs/openapi-snapshot-2026-09-20.json).
 * Types are split by *schema*, not by model: two models that share a request
 * schema share a params type (e.g. FLUX.2 [pro] and [max] both use Flux2ProParams),
 * and two models with the same marketing family but different schemas get
 * different types (FLUX.2 [flex] carries guidance/steps/prompt_upsampling that
 * [pro]/[max] do not). See docs/DECISIONS.md #1.
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
 * Model endpoint keys — one per generation endpoint the wrapper exposes.
 */
export type ModelEndpointKey =
  // FLUX.1 family
  | 'flux-dev'
  | 'flux-pro'
  | 'flux-ultra'
  | 'flux-ultra-finetuned'
  | 'flux-pro-fill'
  | 'flux-pro-fill-finetuned'
  | 'flux-pro-expand'
  | 'kontext-pro'
  | 'kontext-max'
  // FLUX.2 family
  | 'flux-2-pro'
  | 'flux-2-flex'
  | 'flux-2-max'
  | 'flux-2-klein-4b'
  | 'flux-2-klein-9b'
  // FLUX Tools (image)
  | 'flux-deblur'
  | 'flux-erase'
  | 'flux-outpaint'
  | 'flux-vto'
  // FLUX 3 (video)
  | 'flux-3-video'
  | 'flux-video-edit'
  | 'flux-video-upscale';

/** What kind of media an endpoint produces. Drives download/extension logic. */
export type MediaKind = 'image' | 'video';

/** Output image formats accepted by every image endpoint. */
export type OutputFormat = 'jpeg' | 'png' | 'webp';

/**
 * Static description of one endpoint. `MODEL_ENDPOINTS` (path-only) is derived
 * from this for backwards compatibility with 1.x consumers.
 */
export interface ModelInfo {
  /** Request path, e.g. '/v1/flux-2-pro' */
  path: string;
  /** Human label used in logs */
  label: string;
  /** Media kind produced */
  media: MediaKind;
  /**
   * Server-side default for output_format when the request omits it.
   * Only image endpoints have one; used by the CLI to pick a file extension.
   */
  defaultOutputFormat?: OutputFormat;
}

export type ModelRegistry = {
  [K in ModelEndpointKey]: ModelInfo;
};

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
 * Constraint on a single request field, keyed by the field's API name.
 * `range` for numeric bounds, `enum` for closed value sets. A field may carry both
 * (e.g. duration: range 5–20 OR the literal 'auto').
 */
export interface FieldConstraint {
  range?: RangeConstraint;
  enum?: readonly (string | number | boolean)[];
}

/**
 * Constraints for a specific model.
 *
 * The named camelCase members are the 1.x surface and are kept as-is. Fields that
 * arrived with the 2.0 endpoints live in `fields`, keyed by API field name, so the
 * spec-drift check (scripts/check-spec-drift.mjs) can compare them to the OpenAPI
 * schema without a per-field alias table.
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
  /** Constraints on fields introduced by the 2.0 endpoints, keyed by API field name. */
  fields?: Record<string, FieldConstraint>;
}

/**
 * All model constraints mapped by model key.
 */
export type ModelConstraints = {
  [K in ModelEndpointKey]: ModelConstraint;
};

// ==================== GENERATION PARAMETER TYPES ====================

/**
 * Request fields accepted by every generation endpoint.
 * Spread through unchanged by every generate* method.
 */
export interface CommonRequestFields {
  /** Opaque identifier for the end user supplied by the calling platform (1–256 chars). */
  user?: string;
  /** URL to receive a webhook notification when the task settles. */
  webhook_url?: string;
  /** Optional secret used to sign the webhook. */
  webhook_secret?: string;
}

/**
 * Base parameters common to most image generation methods.
 */
export interface BaseGenerationParams extends CommonRequestFields {
  /** Text description of desired image (required) */
  prompt: string;
  /** Random seed for reproducibility */
  seed?: number;
  /** Content moderation level (0–6 for FLUX.1, 0–5 for FLUX.2 / tools) */
  safety_tolerance?: number;
  /** Output format: 'jpeg', 'png' or 'webp' */
  output_format?: OutputFormat;
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
  /** Input image as base64 or URL to use as a prompt */
  image_prompt?: string;
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
  /** Enable AI prompt enhancement */
  prompt_upsampling?: boolean;
}

/**
 * Parameters for FLUX 1.1 [pro] Ultra with a fine-tuned model.
 * Same surface as Ultra minus `raw`, plus the finetune pair.
 */
export interface FluxProUltraFinetunedParams extends Omit<FluxProUltraParams, 'raw' | 'user'> {
  /** ID of the fine-tuned model (required) */
  finetune_id: string;
  /** Finetune strength (0.0-2.0, default 1.2) */
  finetune_strength?: number;
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
 * Parameters for Kontext Pro / Max.
 *
 * `input_image` is optional: Kontext generates from text alone when no image is
 * given. Until 2.0 the wrapper required it; the API never did.
 */
export interface KontextProParams extends BaseGenerationParams {
  /** Primary input image as base64 or URL */
  input_image?: string;
  /** Additional reference image */
  input_image_2?: string;
  /** Additional reference image */
  input_image_3?: string;
  /** Additional reference image */
  input_image_4?: string;
  /** Aspect ratio of the output, between 21:9 and 9:21 */
  aspect_ratio?: string;
  /** Enable AI prompt enhancement */
  prompt_upsampling?: boolean;
}

/**
 * Parameters for Kontext Max model generation.
 */
export interface KontextMaxParams extends KontextProParams {}

/** Up to four reference images (Kontext, FLUX.2 [klein]). */
export interface InputImages4 {
  /** Primary input image as base64 or URL */
  input_image?: string;
  /** Additional input image */
  input_image_2?: string;
  /** Additional input image */
  input_image_3?: string;
  /** Additional input image */
  input_image_4?: string;
}

/** Up to eight reference images (FLUX.2 [pro], [flex], [max]). */
export interface InputImages8 extends InputImages4 {
  /** Additional input image */
  input_image_5?: string;
  /** Additional input image */
  input_image_6?: string;
  /** Additional input image */
  input_image_7?: string;
  /** Additional input image */
  input_image_8?: string;
}

/**
 * Parameters for FLUX.2 [pro] and FLUX.2 [max] (schema `Flux2Inputs`).
 *
 * Prompt upsampling is ON by default server-side and is controlled with
 * `disable_pup`, not `prompt_upsampling` — the field 1.x sent no longer exists
 * on this schema.
 */
export interface Flux2ProParams extends BaseGenerationParams, InputImages8 {
  /** Image width (≥64). 0 / omitted lets the server choose. */
  width?: number;
  /** Image height (≥64). 0 / omitted lets the server choose. */
  height?: number;
  /** Disable automatic prompt upsampling and generate from the prompt exactly as written. */
  disable_pup?: boolean;
}

/**
 * Parameters for FLUX.2 [flex] (schema `Flux2FlexInputs`).
 */
export interface Flux2FlexParams extends BaseGenerationParams, InputImages8 {
  /** Image width (≥64). 0 / omitted lets the server choose. */
  width?: number;
  /** Image height (≥64). 0 / omitted lets the server choose. */
  height?: number;
  /** Guidance scale (1.5-10, default 5) */
  guidance?: number;
  /** Number of inference steps (1-50, default 50) */
  steps?: number;
  /** Enable AI prompt enhancement (default true) */
  prompt_upsampling?: boolean;
}

/**
 * Parameters for FLUX.2 [klein] 4B / 9B (schema `Flux2KleinInputs`).
 * Like [pro] but at most four input images and no upsampling control.
 */
export interface Flux2KleinParams extends BaseGenerationParams, InputImages4 {
  /** Image width (≥64). 0 / omitted lets the server choose. */
  width?: number;
  /** Image height (≥64). 0 / omitted lets the server choose. */
  height?: number;
}

/**
 * Union of every FLUX.2 params shape. Kept for consumers who typed against the
 * 1.x `Flux2Params`; new code should use the schema-specific type.
 */
export type Flux2Params = Flux2ProParams | Flux2FlexParams | Flux2KleinParams;

// ---------- FLUX Tools (image) ----------

/**
 * Parameters for Deblur. Takes only an image — no prompt, no mask.
 */
export interface FluxDeblurParams extends CommonRequestFields {
  /** Input image as base64 or URL (required) */
  image: string;
  /** Random seed for reproducibility */
  seed?: number;
  /** Content moderation level (0-5) */
  safety_tolerance?: number;
  /** Output format (default png) */
  output_format?: OutputFormat;
}

/**
 * Parameters for Erase. White mask pixels are removed; black are preserved.
 */
export interface FluxEraseParams extends CommonRequestFields {
  /** Input image as base64 or URL (required) */
  image: string;
  /** Black/white mask as base64 or URL, same dimensions as image (required) */
  mask: string;
  /** Pixels to dilate the mask by before removal (0-25, default 10) */
  dilate_pixels?: number;
  /** Random seed for reproducibility */
  seed?: number;
  /** Content moderation level (0-5) */
  safety_tolerance?: number;
  /** Output format (default png) */
  output_format?: OutputFormat;
}

/**
 * Parameters for Outpainting. The reference image is placed on a canvas of
 * `width`×`height` at (`reference_offset_x`, `reference_offset_y`) — centred when
 * the offsets are omitted — and the rest is generated.
 */
export interface FluxOutpaintParams extends CommonRequestFields {
  /** Reference image as base64 or URL (required) */
  input_image: string;
  /** Target canvas width (≥64, required) */
  width: number;
  /** Target canvas height (≥64, required) */
  height: number;
  /** Crop the input to the canvas if it extends beyond the edges instead of erroring */
  auto_crop?: boolean;
  /** Content moderation level (0-5) */
  safety_tolerance?: number;
  /** Output format (default png) */
  output_format?: OutputFormat;
  /** Experimental: text guidance for the outpainted region */
  prompt?: string;
  /** Left offset (px) of the reference image on the canvas; may be negative. Omit to centre. */
  reference_offset_x?: number;
  /** Top offset (px) of the reference image on the canvas; may be negative. Omit to centre. */
  reference_offset_y?: number;
  /** Quality/speed trade-off (default high) */
  mode?: 'high' | 'fast';
  /** Skip the image-aware prompt upsampler for lower latency */
  disable_pup?: boolean;
}

/**
 * Parameters for Virtual Try-On (v2). Person → input_image, garment → input_image_2.
 */
export interface FluxVtoParams extends CommonRequestFields {
  /** Text prompt, used as a fallback when the generated edit instruction is insufficient (required) */
  prompt: string;
  /** Person image as base64 or URL (required) */
  person: string;
  /** Garment image as base64 or URL (required) */
  garment: string;
  /** Random seed for reproducibility */
  seed?: number;
  /** Content moderation level (0-5) */
  safety_tolerance?: number;
  /** Output format (default jpeg) */
  output_format?: OutputFormat;
}

// ---------- FLUX 3 (video) ----------

/** Aspect ratios accepted by FLUX 3 video, or 'auto' to infer from prompt/references. */
export type VideoAspectRatio = '21:9' | '2:1' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '9:21' | 'auto';

/** Output resolution tiers. fhd/qhd/uhd are finished by the video upsampler. */
export type VideoResolution = 'hd' | 'fhd' | 'qhd' | 'uhd';

/** A keyframe: a bare image (base64 or URL) or a `[seconds, image]` timing pair. */
export type VideoKeyframe = string | [number, string];

/**
 * Fields shared by the three generating modes (t2v / i2v / v2v).
 * Note: no `seed`, `output_format`, or webhook fields — the server rejects unknown
 * keys on this endpoint (`additionalProperties: false`).
 */
export interface Flux3VideoBaseParams {
  /** Opaque end-user identifier (1–256 chars) */
  user?: string;
  /** Free-form prompt describing the video (required) */
  prompt: string;
  /** Aspect ratio or 'auto' (default auto) */
  aspect_ratio?: VideoAspectRatio;
  /** Duration in whole seconds (5–20; 5–15 for v2v) or 'auto' (default auto) */
  duration?: number | 'auto';
  /** Output resolution tier (default hd) */
  resolution?: VideoResolution;
  /** Pinned model release; only 'latest' is published today */
  version?: 'latest';
  /** Generate synchronized audio (default true) */
  generate_audio?: boolean;
  /** Content moderation level (0-4) */
  safety_tolerance?: number;
  /** Fast preview that returns a `draft_cache` URL in the result for later draft_enhance */
  draft?: boolean;
}

/** Text-to-video. */
export interface Flux3VideoT2VParams extends Flux3VideoBaseParams {
  mode: 't2v';
}

/** Image-continuation: one to ten keyframes, plain or `[seconds, image]` timed. */
export interface Flux3VideoI2VParams extends Flux3VideoBaseParams {
  mode: 'i2v';
  /** One image, a list of images spread across the duration, or timed pairs (required) */
  keyframes: VideoKeyframe | VideoKeyframe[];
}

/** Video-continuation: generation carries on from the final frames of `start_video`. */
export interface Flux3VideoV2VParams extends Flux3VideoBaseParams {
  mode: 'v2v';
  /** The video to continue, as URL or base64 mp4 (required) */
  start_video: string;
}

/** Full-quality render of a prior draft. Only these fields are accepted. */
export interface Flux3VideoDraftEnhanceParams {
  mode: 'draft_enhance';
  /** Opaque end-user identifier (1–256 chars) */
  user?: string;
  /** The base64 `.bin` downloaded from a prior draft's `draft_cache` URL, or that URL (required) */
  draft_cache: string;
  /** Output resolution tier (default fhd for this mode) */
  resolution?: VideoResolution;
  /** Content moderation level (0-4) */
  safety_tolerance?: number;
}

/** Discriminated union over the four FLUX 3 video modes. */
export type Flux3VideoParams =
  | Flux3VideoT2VParams
  | Flux3VideoI2VParams
  | Flux3VideoV2VParams
  | Flux3VideoDraftEnhanceParams;

export type Flux3VideoMode = Flux3VideoParams['mode'];

/**
 * Parameters for FLUX Video Edit. Duration, resolution, aspect ratio and audio
 * are taken from the source; there is no `mode`, `seed`, or webhook here.
 */
export interface FluxVideoEditParams {
  /** Opaque end-user identifier (1–256 chars) */
  user?: string;
  /** Video to edit as URL or base64 mp4 (≤15 s, ≤50 MiB, ≥160 px per side) (required) */
  video: string;
  /** Edit instruction, 1–4096 chars (required) */
  prompt: string;
  /** Content moderation level (0-4) */
  safety_tolerance?: number;
}

/**
 * Parameters for FLUX Video Upscale. Covers the first 20 s of the clip.
 */
export interface FluxVideoUpscaleParams extends CommonRequestFields {
  /** Video to upscale as URL or base64 mp4 (≤50 MB) (required) */
  input_video: string;
  /** Optional description steering enhanced detail; empty = neutral upscale */
  prompt?: string;
  /** 0 preserves the source precisely; 1 allows creative detail (default 1) */
  creativity?: 0 | 1;
  /** Scale factor (1.5–3, default 2); capped at a 13.75 MP frame */
  upscale_factor?: number;
  /** Content moderation level (0-4) */
  safety_tolerance?: number;
}

// ==================== RESPONSE TYPES ====================

/**
 * Every status `get_result` can report. In-flight: Pending → Reasoning → Generating.
 * Terminal: Ready, Error, Request Moderated, Content Moderated, Task not found.
 */
export type TaskStatus =
  | 'Task not found'
  | 'Pending'
  | 'Reasoning'
  | 'Generating'
  | 'Request Moderated'
  | 'Content Moderated'
  | 'Ready'
  | 'Error';

/**
 * Response from a generation submit. `polling_url` is present unless a
 * `webhook_url` was supplied, in which case `status` and `webhook_url` are.
 */
export interface SubmitResult {
  /** Task ID */
  id: string;
  /** URL to poll for the result */
  polling_url?: string;
  /** Present on webhook-mode submissions */
  status?: string;
  /** Echoed back on webhook-mode submissions */
  webhook_url?: string;
  /** Estimated cost in credits */
  cost?: number | null;
  /** Input megapixels (2 decimal places) */
  input_mp?: number | null;
  /** Output megapixels (2 decimal places) */
  output_mp?: number | null;
}

/**
 * Task result from polling.
 */
export interface TaskResult {
  /** Task ID */
  id: string;
  /** Task status */
  status: TaskStatus;
  /** Polling URL (present on submit responses that are re-read through this type) */
  polling_url?: string;
  /** Result data when complete. `sample` is the media URL for both images and video. */
  result?: {
    /** Generated image or video URL (signed; expires after ~1 hour) */
    sample?: string;
    /** Draft bundle URL — present when a FLUX 3 video was submitted with draft: true */
    draft_cache?: string;
    /** Error message if failed (legacy location; prefer details.error) */
    error?: string;
    [key: string]: unknown;
  } | null;
  /** Fractional progress while Generating, when the endpoint reports it */
  progress?: number | null;
  /** Additional detail; on Error, `details.error` carries the explanation */
  details?: { error?: string; [key: string]: unknown } | null;
  /** Preview payload, when the endpoint reports one */
  preview?: Record<string, unknown> | null;
  /** Settled cost in credits, once known */
  cost?: number | null;
  /** Input megapixels (submit echo) */
  input_mp?: number | null;
  /** Output megapixels (submit echo) */
  output_mp?: number | null;
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
 * Details of one finetune — the training parameters and metadata the API stores.
 */
export interface FinetuneDetailsResult {
  finetune_details: Record<string, unknown>;
}

/**
 * Response from deleting a finetune.
 */
export interface DeleteFinetuneResult {
  status: string;
  message: string;
  deleted_finetune_id: string;
  timestamp: string;
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
