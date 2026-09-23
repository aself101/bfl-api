#!/usr/bin/env node

/**
 * BFL Generation - Main CLI Script
 *
 * Command-line tool for generating images and video using the Black Forest
 * Labs API. Supports batch processing with multiple prompts across every
 * model the API exposes.
 *
 * Usage:
 *   bfl --flux-dev --prompt "a cat" --width 1024 --height 768
 *   bfl --flux-2-pro --prompt "a castle" --input-image ./ref.jpg
 *   bfl --flux-erase --image ./photo.jpg --mask ./mask.png
 *   bfl --flux-3-video --video-mode t2v --prompt "a fox in autumn woods" --duration 8
 *   bfl --flux-video-edit --video ./clip.mp4 --prompt "make it snow"
 *
 * Or with npm:
 *   npm run bfl -- --flux-dev --prompt "a cat" --width 1024 --height 768
 *
 * Run `bfl --examples` for a worked example of every model.
 */

import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { BflAPI } from './api.js';
import {
  imageToBase64,
  videoToBase64,
  fileToBase64,
  validateImageUrl,
  downloadImage,
  downloadVideo,
  promptToFilename,
  generateTimestampedFilename,
  writeToFile,
  ensureDirectory,
  setLogLevel,
  logger,
  recordSafeEntry,
} from './utils.js';
import { getOutputDir, MODELS, validateModelParams } from './config.js';
import type {
  SubmitResult,
  ModelEndpointKey,
  Flux3VideoParams,
  Flux3VideoMode,
  VideoKeyframe,
  OutputFormat,
} from './types/index.js';

// ES module dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read version from package.json dynamically
const packageJson = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')) as {
  version: string;
};
const { version } = packageJson;

/**
 * CLI options interface (commander camel-cases the flag names).
 */
interface CliOptions {
  // Model selection
  fluxDev?: boolean;
  fluxPro?: boolean;
  fluxUltra?: boolean;
  fluxUltraFinetuned?: boolean;
  fluxFill?: boolean;
  fluxFillFinetuned?: boolean;
  fluxExpand?: boolean;
  kontextPro?: boolean;
  kontextMax?: boolean;
  flux2Pro?: boolean;
  flux2Flex?: boolean;
  flux2Max?: boolean;
  flux2Klein4b?: boolean;
  flux2Klein9b?: boolean;
  fluxDeblur?: boolean;
  fluxErase?: boolean;
  fluxOutpaint?: boolean;
  fluxVto?: boolean;
  flux3Video?: boolean;
  fluxVideoEdit?: boolean;
  fluxVideoUpscale?: boolean;
  // Common
  prompt: string[];
  seed?: number;
  safetyTolerance?: number;
  outputFormat?: OutputFormat;
  promptUpsampling?: boolean;
  disablePup?: boolean;
  user?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  // Dimensions / sampling
  width?: number;
  height?: number;
  steps?: number;
  guidance?: number;
  aspectRatio?: string;
  raw?: boolean;
  // Image inputs
  imagePrompt?: string;
  imagePromptStrength?: number;
  image?: string;
  mask?: string;
  inputImage?: string;
  inputImage2?: string;
  inputImage3?: string;
  inputImage4?: string;
  inputImage5?: string;
  inputImage6?: string;
  inputImage7?: string;
  inputImage8?: string;
  person?: string;
  garment?: string;
  // Expand (FLUX.1)
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  // Finetune
  finetuneId?: string;
  finetuneStrength?: number;
  // FLUX Tools (image)
  dilatePixels?: number;
  autoCrop?: boolean;
  referenceOffsetX?: number;
  referenceOffsetY?: number;
  outpaintMode?: 'high' | 'fast';
  // Video
  videoMode?: Flux3VideoMode;
  keyframe?: string[];
  startVideo?: string;
  draftCache?: string;
  duration?: string;
  resolution?: string;
  audio?: boolean;
  draft?: boolean;
  video?: string;
  inputVideo?: string;
  creativity?: number;
  upscaleFactor?: number;
  // Utility
  apiKey?: string;
  examples?: boolean;
  credits?: boolean;
  listFinetunes?: boolean;
  finetuneDetails?: string;
  deleteFinetune?: string;
  yes?: boolean;
  getResult?: string;
  pollingUrl?: string;
  timeout?: number;
  outputDir?: string;
  logLevel: string;
  dryRun?: boolean;
}

/** Loosely-typed bag of API params; narrowed at the call site per model. */
type GenerationParams = Record<string, unknown> & { prompt?: string };

/**
 * Generation result interface
 */
interface GenerationResult {
  success: boolean;
  dryRun?: boolean;
  taskId?: string;
  outputPath?: string;
  metadataPath?: string;
  metadata?: Record<string, unknown>;
  error?: string;
  prompt?: string;
}

/**
 * Display usage examples.
 */
function showExamples(): void {
  console.log(`
${'='.repeat(60)}
BFL GENERATION - USAGE EXAMPLES
${'='.repeat(60)}

--- FLUX.1 ---

1. FLUX.1 [dev] - Basic text-to-image
   $ bfl --flux-dev \\
       --prompt "a serene mountain landscape at sunset" \\
       --width 1024 --height 768 \\
       --steps 28 --guidance 3

2. FLUX 1.1 [pro] - Redux image-to-image
   $ bfl --flux-pro \\
       --prompt "same style but at night with city lights" \\
       --image-prompt ./reference.jpg \\
       --width 1024 --height 1024

3. FLUX 1.1 [pro] Ultra - Cinematic wide format
   $ bfl --flux-ultra \\
       --prompt "epic cinematic landscape, golden hour" \\
       --aspect-ratio "21:9" \\
       --raw

4. FLUX 1.1 [pro] Ultra Finetune - Your model at ultra quality
   $ bfl --flux-ultra-finetuned \\
       --finetune-id "my-custom-model" \\
       --prompt "product shot in my brand style" \\
       --finetune-strength 1.2 --aspect-ratio "1:1"

5. FLUX.1 Fill [pro] - Inpainting with mask
   $ bfl --flux-fill \\
       --prompt "fill with lush green grass and flowers" \\
       --image ./photo.jpg \\
       --mask ./mask.png \\
       --steps 30 --guidance 5

6. FLUX.1 Fill [pro] Finetune - Custom model inpainting
   $ bfl --flux-fill-finetuned \\
       --finetune-id "my-custom-model" \\
       --prompt "apply my custom style to the masked area" \\
       --image ./photo.jpg --mask ./mask.png \\
       --finetune-strength 1.2

7. FLUX.1 Expand [pro] - Extend image on all sides
   $ bfl --flux-expand \\
       --prompt "extend with dramatic clouds and mountain vista" \\
       --image ./photo.jpg \\
       --top 512 --bottom 256 --left 256 --right 256

8. Kontext Pro - Image editing
   $ bfl --kontext-pro \\
       --prompt "make it look like winter, add snow" \\
       --input-image ./summer_photo.jpg

9. Kontext Max - Text-only generation with aspect ratio
   $ bfl --kontext-max \\
       --prompt "a lighthouse in a storm" \\
       --aspect-ratio "16:9"

--- FLUX.2 ---

10. FLUX.2 [pro] - Text-to-image (prompt upsampling is on by default)
    $ bfl --flux-2-pro \\
        --prompt "a majestic castle on a cliff at sunset" \\
        --width 1024 --height 1024

11. FLUX.2 [pro] - Edit with your prompt used verbatim
    $ bfl --flux-2-pro \\
        --prompt "add a dragon flying in the sky" \\
        --input-image ./castle.jpg \\
        --disable-pup

12. FLUX.2 [max] - Highest quality, multi-reference
    $ bfl --flux-2-max \\
        --prompt "combine the subject and style" \\
        --input-image ./subject.jpg \\
        --input-image-2 ./style_reference.jpg

13. FLUX.2 [flex] - Control guidance and steps
    $ bfl --flux-2-flex \\
        --prompt "a detailed watercolor of a harbour" \\
        --guidance 4 --steps 30

14. FLUX.2 [klein] 4B / 9B - Fast tier, up to four references
    $ bfl --flux-2-klein-4b --prompt "a red bicycle" --width 768 --height 768
    $ bfl --flux-2-klein-9b --prompt "the bicycle at night" --input-image ./bike.jpg

--- FLUX Tools (image) ---

15. Deblur - Image only, no prompt
    $ bfl --flux-deblur --image ./blurry.jpg

16. Erase - Remove what the mask marks (white = remove)
    $ bfl --flux-erase \\
        --image ./photo.jpg --mask ./remove_mask.png \\
        --dilate-pixels 12

17. Outpaint - Place the image on a larger canvas
    $ bfl --flux-outpaint \\
        --input-image ./photo.jpg \\
        --width 2048 --height 1024 \\
        --prompt "extend the horizon" \\
        --outpaint-mode fast

18. Virtual Try-On
    $ bfl --flux-vto \\
        --prompt "TRY-ON: The person of image 1 wearing the garments of image 2." \\
        --person ./person.jpg --garment ./jacket.png

--- FLUX 3 (video) ---

19. Text-to-video
    $ bfl --flux-3-video --video-mode t2v \\
        --prompt "a fox runs through autumn woods" \\
        --duration 8 --resolution fhd --aspect-ratio "16:9"

20. Image-continuation - keyframes spread across the duration
    $ bfl --flux-3-video --video-mode i2v \\
        --prompt "the scene comes alive" \\
        --keyframe ./start.jpg ./end.jpg \\
        --duration 6

21. Image-continuation - timed keyframes (seconds:path)
    $ bfl --flux-3-video --video-mode i2v \\
        --prompt "morph between the two" \\
        --keyframe 0:./a.jpg 4.5:./b.jpg

22. Video-continuation
    $ bfl --flux-3-video --video-mode v2v \\
        --prompt "the camera keeps pulling back" \\
        --start-video ./clip.mp4 --duration 10

23. Draft then enhance
    $ bfl --flux-3-video --video-mode t2v --prompt "..." --draft
    # download the draft_cache .bin from the result, then:
    $ bfl --flux-3-video --video-mode draft_enhance \\
        --draft-cache ./draft.bin --resolution qhd

24. Video edit
    $ bfl --flux-video-edit --video ./clip.mp4 --prompt "make it snow"

25. Video upscale
    $ bfl --flux-video-upscale --input-video ./clip.mp4 \\
        --upscale-factor 2 --creativity 0

--- Batch, output, utilities ---

26. Batch generation - Multiple prompts
    $ bfl --flux-dev \\
        --prompt "a red sports car" \\
        --prompt "a blue vintage car" \\
        --seed 42 --width 1024 --height 768

27. Output format and directory
    $ bfl --flux-2-pro --prompt "logo design" \\
        --output-format webp --output-dir ./my-generations

28. Webhook instead of polling
    $ bfl --flux-2-pro --prompt "..." \\
        --webhook-url https://example.com/hook --webhook-secret s3cret

29. Dry run to preview parameters
    $ bfl --flux-ultra --prompt "test prompt" --aspect-ratio "21:9" --dry-run

30. Account and finetunes
    $ bfl --credits
    $ bfl --list-finetunes
    $ bfl --finetune-details my-custom-model
    $ bfl --delete-finetune my-custom-model --yes

31. Poll existing task (tasks are regional — pass the polling_url from the metadata file)
    $ bfl --get-result abc123def456 --polling-url https://api.eu2.bfl.ai/v1/get_result?id=abc123def456

AUTHENTICATION OPTIONS:

A. CLI flag (highest priority)
   $ bfl --api-key YOUR_KEY --flux-dev --prompt "test"

B. Environment variable
   $ export BFL_API_KEY=YOUR_KEY

C. Local .env file (current directory)
   $ echo "BFL_API_KEY=YOUR_KEY" > .env

D. Global config (for global installs)
   $ mkdir -p ~/.bfl && echo "BFL_API_KEY=YOUR_KEY" > ~/.bfl/.env

${'='.repeat(60)}
`);
}

/**
 * CLI flag (camelCased) → model key, in the order the flags are declared.
 */
const MODEL_FLAGS: Record<string, ModelEndpointKey> = {
  fluxDev: 'flux-dev',
  fluxPro: 'flux-pro',
  fluxUltra: 'flux-ultra',
  fluxUltraFinetuned: 'flux-ultra-finetuned',
  fluxFill: 'flux-pro-fill',
  fluxFillFinetuned: 'flux-pro-fill-finetuned',
  fluxExpand: 'flux-pro-expand',
  kontextPro: 'kontext-pro',
  kontextMax: 'kontext-max',
  flux2Pro: 'flux-2-pro',
  flux2Flex: 'flux-2-flex',
  flux2Max: 'flux-2-max',
  flux2Klein4b: 'flux-2-klein-4b',
  flux2Klein9b: 'flux-2-klein-9b',
  fluxDeblur: 'flux-deblur',
  fluxErase: 'flux-erase',
  fluxOutpaint: 'flux-outpaint',
  fluxVto: 'flux-vto',
  flux3Video: 'flux-3-video',
  fluxVideoEdit: 'flux-video-edit',
  fluxVideoUpscale: 'flux-video-upscale',
};

/**
 * Get the model name from command options.
 *
 * @param options - Parsed command options
 * @returns Model name or null if none selected
 */
function getSelectedModel(options: CliOptions): ModelEndpointKey | null {
  const selected = Object.entries(MODEL_FLAGS)
    .filter(([flag]) => (options as unknown as Record<string, unknown>)[flag])
    .map(([, model]) => model);
  if (selected.length > 1) {
    throw new Error(`Invalid input: select exactly one model (got: ${selected.join(', ')})`);
  }
  return selected[0] ?? null;
}

/** Models that run without a --prompt. */
const PROMPT_OPTIONAL: ReadonlySet<ModelEndpointKey> = new Set([
  'flux-pro-expand',
  'flux-deblur',
  'flux-erase',
  'flux-outpaint',
  'flux-video-upscale',
]);

/**
 * Required file/URL inputs per model, as CLI flag names for the error message.
 */
const REQUIRED_INPUTS: Partial<Record<ModelEndpointKey, string[]>> = {
  'flux-pro-fill': ['--image'],
  'flux-pro-fill-finetuned': ['--image', '--finetune-id'],
  'flux-ultra-finetuned': ['--finetune-id'],
  'flux-pro-expand': ['--image'],
  'flux-deblur': ['--image'],
  'flux-erase': ['--image', '--mask'],
  'flux-outpaint': ['--input-image', '--width', '--height'],
  'flux-vto': ['--person', '--garment'],
  'flux-video-edit': ['--video'],
  'flux-video-upscale': ['--input-video'],
};

/** Flag name → option key, for REQUIRED_INPUTS lookups. */
function flagToOption(flag: string): keyof CliOptions {
  return flag
    .replace(/^--/, '')
    .replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase()) as keyof CliOptions;
}

/**
 * Copy a CLI option onto the params object under its API name if it was set.
 */
function put(
  params: GenerationParams,
  options: CliOptions,
  option: keyof CliOptions,
  apiName: string
): void {
  const value = options[option];
  if (value !== undefined && value !== null) {
    params[apiName] = value;
  }
}

/**
 * Add parameters shared by most image models.
 */
function addCommonParams(params: GenerationParams, options: CliOptions): void {
  put(params, options, 'seed', 'seed');
  put(params, options, 'safetyTolerance', 'safety_tolerance');
  put(params, options, 'outputFormat', 'output_format');
  put(params, options, 'user', 'user');
  put(params, options, 'webhookUrl', 'webhook_url');
  put(params, options, 'webhookSecret', 'webhook_secret');
}

/**
 * Add model-specific parameters (everything except media inputs).
 */
function addModelParams(model: ModelEndpointKey, params: GenerationParams, options: CliOptions): void {
  switch (model) {
    case 'flux-dev':
      put(params, options, 'width', 'width');
      put(params, options, 'height', 'height');
      put(params, options, 'steps', 'steps');
      put(params, options, 'guidance', 'guidance');
      put(params, options, 'promptUpsampling', 'prompt_upsampling');
      break;
    case 'flux-pro':
      put(params, options, 'width', 'width');
      put(params, options, 'height', 'height');
      put(params, options, 'promptUpsampling', 'prompt_upsampling');
      break;
    case 'flux-ultra':
      put(params, options, 'aspectRatio', 'aspect_ratio');
      put(params, options, 'raw', 'raw');
      put(params, options, 'imagePromptStrength', 'image_prompt_strength');
      put(params, options, 'promptUpsampling', 'prompt_upsampling');
      break;
    case 'flux-ultra-finetuned':
      put(params, options, 'finetuneId', 'finetune_id');
      put(params, options, 'finetuneStrength', 'finetune_strength');
      put(params, options, 'aspectRatio', 'aspect_ratio');
      put(params, options, 'imagePromptStrength', 'image_prompt_strength');
      put(params, options, 'promptUpsampling', 'prompt_upsampling');
      break;
    case 'flux-pro-fill':
      put(params, options, 'steps', 'steps');
      put(params, options, 'guidance', 'guidance');
      put(params, options, 'promptUpsampling', 'prompt_upsampling');
      break;
    case 'flux-pro-fill-finetuned':
      put(params, options, 'finetuneId', 'finetune_id');
      put(params, options, 'finetuneStrength', 'finetune_strength');
      put(params, options, 'steps', 'steps');
      put(params, options, 'guidance', 'guidance');
      put(params, options, 'promptUpsampling', 'prompt_upsampling');
      break;
    case 'flux-pro-expand':
      put(params, options, 'top', 'top');
      put(params, options, 'bottom', 'bottom');
      put(params, options, 'left', 'left');
      put(params, options, 'right', 'right');
      put(params, options, 'steps', 'steps');
      put(params, options, 'guidance', 'guidance');
      put(params, options, 'promptUpsampling', 'prompt_upsampling');
      break;
    case 'kontext-pro':
    case 'kontext-max':
      put(params, options, 'aspectRatio', 'aspect_ratio');
      put(params, options, 'promptUpsampling', 'prompt_upsampling');
      break;
    case 'flux-2-pro':
    case 'flux-2-max':
      put(params, options, 'width', 'width');
      put(params, options, 'height', 'height');
      put(params, options, 'disablePup', 'disable_pup');
      break;
    case 'flux-2-flex':
      put(params, options, 'width', 'width');
      put(params, options, 'height', 'height');
      put(params, options, 'guidance', 'guidance');
      put(params, options, 'steps', 'steps');
      put(params, options, 'promptUpsampling', 'prompt_upsampling');
      break;
    case 'flux-2-klein-4b':
    case 'flux-2-klein-9b':
      put(params, options, 'width', 'width');
      put(params, options, 'height', 'height');
      break;
    case 'flux-deblur':
      break;
    case 'flux-erase':
      put(params, options, 'dilatePixels', 'dilate_pixels');
      break;
    case 'flux-outpaint':
      put(params, options, 'width', 'width');
      put(params, options, 'height', 'height');
      put(params, options, 'autoCrop', 'auto_crop');
      put(params, options, 'referenceOffsetX', 'reference_offset_x');
      put(params, options, 'referenceOffsetY', 'reference_offset_y');
      put(params, options, 'outpaintMode', 'mode');
      put(params, options, 'disablePup', 'disable_pup');
      break;
    case 'flux-vto':
      break;
    case 'flux-3-video':
      put(params, options, 'videoMode', 'mode');
      put(params, options, 'aspectRatio', 'aspect_ratio');
      put(params, options, 'resolution', 'resolution');
      put(params, options, 'draft', 'draft');
      if (options.audio === false) params.generate_audio = false;
      if (options.duration !== undefined) {
        params.duration = options.duration === 'auto' ? 'auto' : parseInt(options.duration, 10);
      }
      break;
    case 'flux-video-edit':
      break;
    case 'flux-video-upscale':
      put(params, options, 'creativity', 'creativity');
      put(params, options, 'upscaleFactor', 'upscale_factor');
      break;
  }
}

/**
 * Image inputs: CLI option → API parameter. Converted to base64 before submit.
 */
const IMAGE_INPUTS: { option: keyof CliOptions; param: string; label: string }[] = [
  { option: 'imagePrompt', param: 'image_prompt', label: 'image prompt' },
  { option: 'image', param: 'image', label: 'image' },
  { option: 'mask', param: 'mask', label: 'mask' },
  { option: 'inputImage', param: 'input_image', label: 'input image' },
  { option: 'inputImage2', param: 'input_image_2', label: 'input image 2' },
  { option: 'inputImage3', param: 'input_image_3', label: 'input image 3' },
  { option: 'inputImage4', param: 'input_image_4', label: 'input image 4' },
  { option: 'inputImage5', param: 'input_image_5', label: 'input image 5' },
  { option: 'inputImage6', param: 'input_image_6', label: 'input image 6' },
  { option: 'inputImage7', param: 'input_image_7', label: 'input image 7' },
  { option: 'inputImage8', param: 'input_image_8', label: 'input image 8' },
  { option: 'person', param: 'person', label: 'person image' },
  { option: 'garment', param: 'garment', label: 'garment image' },
];

/**
 * Video inputs: CLI option → API parameter. Local files become base64; URLs pass through.
 */
const VIDEO_INPUTS: { option: keyof CliOptions; param: string; label: string }[] = [
  { option: 'video', param: 'video', label: 'video' },
  { option: 'inputVideo', param: 'input_video', label: 'input video' },
  { option: 'startVideo', param: 'start_video', label: 'start video' },
];

/**
 * Parse one --keyframe spec: `path-or-url` or `seconds:path-or-url`.
 */
async function parseKeyframe(spec: string): Promise<VideoKeyframe> {
  const timed = /^(\d+(?:\.\d+)?):(.+)$/.exec(spec);
  if (timed) {
    return [parseFloat(timed[1]), await imageToBase64(timed[2])];
  }
  return await imageToBase64(spec);
}

/**
 * Prepare a draft_cache input: a local .bin becomes base64; a URL passes through.
 */
async function prepareDraftCache(input: string): Promise<string> {
  if (input.startsWith('http://') || input.startsWith('https://')) {
    await validateImageUrl(input);
    return input;
  }
  return await fileToBase64(input);
}

/**
 * Convert media inputs and add to parameters.
 */
async function addMediaInputs(params: GenerationParams, options: CliOptions): Promise<void> {
  for (const { option, param, label } of IMAGE_INPUTS) {
    const value = options[option];
    if (value && typeof value === 'string') {
      logger.info(`Converting ${label} to base64...`);
      params[param] = await imageToBase64(value);
    }
  }
  for (const { option, param, label } of VIDEO_INPUTS) {
    const value = options[option];
    if (value && typeof value === 'string') {
      logger.info(`Preparing ${label}...`);
      params[param] = await videoToBase64(value);
    }
  }
  if (options.keyframe && options.keyframe.length > 0) {
    logger.info(`Converting ${options.keyframe.length} keyframe(s)...`);
    const frames: VideoKeyframe[] = [];
    for (const spec of options.keyframe) {
      frames.push(await parseKeyframe(spec));
    }
    params.keyframes = frames.length === 1 && typeof frames[0] === 'string' ? frames[0] : frames;
  }
  if (options.draftCache) {
    logger.info('Preparing draft cache...');
    params.draft_cache = await prepareDraftCache(options.draftCache);
  }
}

/**
 * Dispatch to the API method for the model. Params are built by name to match
 * the API's request schema, so each call is a cast to that method's type.
 */
async function submit(
  api: BflAPI,
  model: ModelEndpointKey,
  params: GenerationParams
): Promise<SubmitResult> {
  switch (model) {
    case 'flux-dev':
      return api.generateFluxDev(params as unknown as Parameters<typeof api.generateFluxDev>[0]);
    case 'flux-pro':
      return api.generateFluxPro(params as unknown as Parameters<typeof api.generateFluxPro>[0]);
    case 'flux-ultra':
      return api.generateFluxProUltra(params as unknown as Parameters<typeof api.generateFluxProUltra>[0]);
    case 'flux-ultra-finetuned':
      return api.generateFluxProUltraFinetuned(params as unknown as Parameters<typeof api.generateFluxProUltraFinetuned>[0]);
    case 'flux-pro-fill':
      return api.generateFluxProFill(params as unknown as Parameters<typeof api.generateFluxProFill>[0]);
    case 'flux-pro-fill-finetuned':
      return api.generateFluxProFillFinetuned(params as unknown as Parameters<typeof api.generateFluxProFillFinetuned>[0]);
    case 'flux-pro-expand':
      return api.generateFluxProExpand(params as unknown as Parameters<typeof api.generateFluxProExpand>[0]);
    case 'kontext-pro':
      return api.generateKontextPro(params as unknown as Parameters<typeof api.generateKontextPro>[0]);
    case 'kontext-max':
      return api.generateKontextMax(params as unknown as Parameters<typeof api.generateKontextMax>[0]);
    case 'flux-2-pro':
      return api.generateFlux2Pro(params as unknown as Parameters<typeof api.generateFlux2Pro>[0]);
    case 'flux-2-flex':
      return api.generateFlux2Flex(params as unknown as Parameters<typeof api.generateFlux2Flex>[0]);
    case 'flux-2-max':
      return api.generateFlux2Max(params as unknown as Parameters<typeof api.generateFlux2Max>[0]);
    case 'flux-2-klein-4b':
      return api.generateFlux2Klein4b(params as unknown as Parameters<typeof api.generateFlux2Klein4b>[0]);
    case 'flux-2-klein-9b':
      return api.generateFlux2Klein9b(params as unknown as Parameters<typeof api.generateFlux2Klein9b>[0]);
    case 'flux-deblur':
      return api.deblurImage(params as unknown as Parameters<typeof api.deblurImage>[0]);
    case 'flux-erase':
      return api.eraseImage(params as unknown as Parameters<typeof api.eraseImage>[0]);
    case 'flux-outpaint':
      return api.outpaintImage(params as unknown as Parameters<typeof api.outpaintImage>[0]);
    case 'flux-vto':
      return api.virtualTryOn(params as unknown as Parameters<typeof api.virtualTryOn>[0]);
    case 'flux-3-video':
      return api.generateFlux3Video(params as unknown as Flux3VideoParams);
    case 'flux-video-edit':
      return api.editVideo(params as unknown as Parameters<typeof api.editVideo>[0]);
    case 'flux-video-upscale':
      return api.upscaleVideo(params as unknown as Parameters<typeof api.upscaleVideo>[0]);
  }
}

/**
 * Render params for a dry run with base64 payloads elided.
 */
function summarizeParams(params: GenerationParams): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, recordSafeEntry(k, v)])),
    null,
    2
  );
}

/**
 * Process a single generation request.
 */
async function generate(
  api: BflAPI,
  model: ModelEndpointKey,
  prompt: string,
  options: CliOptions,
  index: number,
  total: number
): Promise<GenerationResult> {
  const batchPrefix = total > 1 ? `[${index + 1}/${total}] ` : '';
  const info = MODELS[model];

  logger.info('='.repeat(60));
  logger.info(`${batchPrefix}Starting ${info.media} generation`);
  logger.info(`Model: ${model}`);
  if (prompt) logger.info(`Prompt: "${prompt}"`);
  logger.info('='.repeat(60));

  try {
    // Prepare parameters based on model
    const params: GenerationParams = {};
    const promptOptional = PROMPT_OPTIONAL.has(model) || options.videoMode === 'draft_enhance';
    if (prompt || !promptOptional) params.prompt = prompt;

    await addMediaInputs(params, options);
    addCommonParams(params, options);
    addModelParams(model, params, options);

    // Range/enum validation against the model's constraints
    const validation = validateModelParams(model, params);
    if (!validation.valid) {
      throw new Error(`Invalid input:\n  - ${validation.errors.join('\n  - ')}`);
    }

    // Dry run check
    if (options.dryRun) {
      logger.info('[DRY RUN] Would generate with parameters:');
      logger.info(summarizeParams(params));
      logger.info('[DRY RUN] Skipping actual generation');
      return { success: true, dryRun: true };
    }

    // Submit generation request
    logger.info('Submitting generation request...');
    const task = await submit(api, model, params);

    logger.info(`Task submitted: ${task.id}`);
    if (task.cost !== undefined && task.cost !== null) logger.info(`Estimated cost: ${task.cost} credits`);

    // Webhook mode: nothing to poll
    if (!task.polling_url) {
      logger.info(`No polling URL returned (webhook mode: ${task.webhook_url || 'n/a'})`);
      return { success: true, taskId: task.id, prompt };
    }
    logger.info(`Polling URL: ${task.polling_url}`);

    // Wait for result with auto-polling
    const result = await api.waitForResult(task.id, {
      pollingUrl: task.polling_url,
      timeout: options.timeout || (info.media === 'video' ? 900 : 300),
      pollInterval: 2,
      showSpinner: true,
    });

    // Save result
    const outputDir = options.outputDir || getOutputDir();
    const modelDir = path.join(outputDir, model);
    await ensureDirectory(modelDir);

    // Extension: video is always mp4; images follow the requested or server-default format
    const format = (params.output_format as OutputFormat | undefined) || info.defaultOutputFormat || 'jpeg';
    const extension = info.media === 'video' ? 'mp4' : format === 'jpeg' ? 'jpg' : format;
    const stem = promptToFilename(prompt || model);
    const outputFilename = generateTimestampedFilename(stem, extension);
    const outputPath = path.join(modelDir, outputFilename);

    // Download media
    if (!result.result?.sample) {
      throw new Error('No media URL in result');
    }
    logger.info(`Downloading generated ${info.media}...`);
    if (info.media === 'video') {
      await downloadVideo(result.result.sample, outputPath);
    } else {
      await downloadImage(result.result.sample, outputPath);
    }
    logger.info(`Saved: ${outputPath}`);

    // A draft render also returns a draft_cache bundle; save it beside the video so it can be
    // passed back to --video-mode draft_enhance after the signed URL has expired.
    let draftCachePath: string | undefined;
    if (result.result.draft_cache) {
      draftCachePath = outputPath.replace(/\.[a-z0-9]+$/, '.draft.bin');
      logger.info('Downloading draft cache...');
      await downloadVideo(result.result.draft_cache, draftCachePath);
      logger.info(`Draft cache saved: ${draftCachePath} (use with --video-mode draft_enhance --draft-cache)`);
    }

    // Save metadata
    const metadataFilename = outputFilename.replace(/\.[a-z0-9]+$/, '_metadata.json');
    const metadataPath = path.join(modelDir, metadataFilename);
    const metadata = {
      task_id: task.id,
      polling_url: task.polling_url,
      model: model,
      timestamp: new Date().toISOString(),
      parameters: JSON.parse(summarizeParams(params)) as Record<string, unknown>,
      result: {
        status: result.status,
        media_url: result.result.sample,
        draft_cache_url: result.result.draft_cache,
        draft_cache_path: draftCachePath,
        output_path: outputPath,
        cost: result.cost ?? task.cost,
      },
    };
    await writeToFile(metadata, metadataPath, 'json');
    logger.info(`Metadata saved: ${metadataPath}`);

    logger.info('='.repeat(60));
    logger.info(`${batchPrefix}Generation complete!`);
    logger.info('='.repeat(60));

    return {
      success: true,
      taskId: task.id,
      outputPath,
      metadataPath,
      metadata,
    };
  } catch (error) {
    const err = error as Error;
    logger.error('='.repeat(60));
    // A local validation failure never reached the API — calling it a
    // "generation failure" would point the user at the wrong thing.
    const label = err.message.startsWith('Invalid input') ? '' : 'Generation failed: ';
    logger.error(`${batchPrefix}${label}${err.message}`);
    logger.error('='.repeat(60));

    return {
      success: false,
      error: err.message,
      prompt,
    };
  }
}

/**
 * Validate what the constraint table cannot: required inputs and mode-specific
 * requirements. Ranges and enums are checked per request by validateModelParams.
 */
function validateInputs(model: ModelEndpointKey, options: CliOptions): void {
  const errors: string[] = [];

  for (const flag of REQUIRED_INPUTS[model] ?? []) {
    if (options[flagToOption(flag)] === undefined) {
      errors.push(`${flag} is required for ${MODELS[model].label}`);
    }
  }

  // Fill models: JPEG has no alpha channel, so a mask is mandatory
  if ((model === 'flux-pro-fill' || model === 'flux-pro-fill-finetuned') && options.image && !options.mask) {
    const imageExt = path.extname(options.image).toLowerCase();
    if (imageExt === '.jpg' || imageExt === '.jpeg') {
      errors.push(
        `${MODELS[model].label} requires --mask when using JPG/JPEG images (they do not support alpha channels). Either provide --mask or use a PNG image with an alpha channel.`
      );
    } else if (imageExt === '.png') {
      logger.warn(
        'Using PNG without --mask parameter. The PNG must contain an alpha channel (transparency) to define the mask area, otherwise the API will reject it.'
      );
    }
  }

  // FLUX 3 video: mode and its required input
  if (model === 'flux-3-video') {
    if (!options.videoMode) {
      errors.push('--video-mode is required for FLUX 3 Video (t2v, i2v, v2v, draft_enhance)');
    } else if (options.videoMode === 'i2v' && !(options.keyframe && options.keyframe.length)) {
      errors.push('--keyframe is required for --video-mode i2v');
    } else if (options.videoMode === 'v2v' && !options.startVideo) {
      errors.push('--start-video is required for --video-mode v2v');
    } else if (options.videoMode === 'draft_enhance' && !options.draftCache) {
      errors.push('--draft-cache is required for --video-mode draft_enhance');
    }
    if (options.videoMode === 'draft_enhance' && options.prompt.length > 0) {
      logger.warn('--prompt is ignored for --video-mode draft_enhance (the draft cache pins it)');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid input:\n  - ${errors.join('\n  - ')}`);
  }
}

/**
 * Main execution function.
 */
async function main(): Promise<void> {
  const program = new Command();

  program
    .name('bfl')
    .description('Generate images and video using the Black Forest Labs API')
    .version(version);

  // Model selection (mutually exclusive)
  program
    .option('--flux-dev', 'FLUX.1 [dev] (full control over steps/guidance)')
    .option('--flux-pro', 'FLUX 1.1 [pro] (professional quality with Redux)')
    .option('--flux-ultra', 'FLUX 1.1 [pro] Ultra (aspect ratios and raw mode)')
    .option('--flux-ultra-finetuned', 'FLUX 1.1 [pro] Ultra with a fine-tuned model')
    .option('--flux-fill', 'FLUX.1 Fill [pro] (inpainting with masks)')
    .option('--flux-fill-finetuned', 'FLUX.1 Fill [pro] with a fine-tuned model')
    .option('--flux-expand', 'FLUX.1 Expand [pro] (expand by pixels per side)')
    .option('--kontext-pro', 'Kontext Pro (multi-reference editing or text-to-image)')
    .option('--kontext-max', 'Kontext Max (maximum quality editing)')
    .option('--flux-2-pro', 'FLUX.2 [pro] (generate/edit, up to 8 references)')
    .option('--flux-2-flex', 'FLUX.2 [flex] (generate/edit with guidance/steps control)')
    .option('--flux-2-max', 'FLUX.2 [max] (highest quality, up to 8 references)')
    .option('--flux-2-klein-4b', 'FLUX.2 [klein] 4B (fastest, up to 4 references)')
    .option('--flux-2-klein-9b', 'FLUX.2 [klein] 9B (fast, up to 4 references)')
    .option('--flux-deblur', 'FLUX Deblur (image only)')
    .option('--flux-erase', 'FLUX Erase (remove masked object)')
    .option('--flux-outpaint', 'FLUX Outpaint (place image on a larger canvas)')
    .option('--flux-vto', 'FLUX Virtual Try-On (person + garment)')
    .option('--flux-3-video', 'FLUX 3 Video (t2v / i2v / v2v / draft_enhance)')
    .option('--flux-video-edit', 'FLUX Video Edit (video + instruction)')
    .option('--flux-video-upscale', 'FLUX Video Upscale');

  // Common parameters
  program
    .option('--prompt <text...>', 'Text prompt(s) for generation (can specify multiple)', [])
    .option('--seed <number>', 'Random seed for reproducibility', parseInt)
    .option(
      '--safety-tolerance <number>',
      'Content moderation level (0-6 FLUX.1, 0-5 FLUX.2/tools, 0-4 video; default: 2)',
      parseInt
    )
    .option('--output-format <format>', 'Output format: jpeg, png or webp (image models)')
    .option('--prompt-upsampling', 'Enable AI prompt enhancement (FLUX.1, Kontext, FLUX.2 [flex])')
    .option('--disable-pup', 'Disable prompt upsampling (FLUX.2 [pro]/[max], Outpaint — on by default)')
    .option('--user <id>', 'Opaque end-user identifier forwarded to the API')
    .option('--webhook-url <url>', 'Receive the result by webhook instead of polling')
    .option('--webhook-secret <secret>', 'Secret used to sign the webhook');

  // Dimensions / sampling
  program
    .option('--width <number>', 'Image width (FLUX.1: 256-1440/32; FLUX.2: ≥64; Outpaint: canvas)', parseInt)
    .option('--height <number>', 'Image height (see --width)', parseInt)
    .option('--steps <number>', 'Inference steps (dev 1-50, fill/expand 15-50, flex 1-50)', parseInt)
    .option('--guidance <number>', 'Guidance scale (dev 1.5-5, fill/expand 1.5-100, flex 1.5-10)', parseFloat)
    .option('--aspect-ratio <ratio>', 'Aspect ratio (e.g. 16:9, 21:9, 1:1; video also 2:1 and auto)')
    .option('--raw', 'Enable raw/natural mode (Ultra)');

  // Image inputs
  program
    .option('--image-prompt <path>', 'Input image for Redux/remix (file path or URL)')
    .option('--image-prompt-strength <number>', 'Remix strength for Ultra (0-1, default: 0.1)', parseFloat)
    .option('--image <path>', 'Input image for Fill / Expand / Deblur / Erase (file path or URL)')
    .option('--mask <path>', 'Mask image for Fill (optional) / Erase (required)')
    .option('--input-image <path>', 'Primary input image (Kontext, FLUX.2, Outpaint)')
    .option('--input-image-2 <path>', 'Additional reference image')
    .option('--input-image-3 <path>', 'Additional reference image')
    .option('--input-image-4 <path>', 'Additional reference image')
    .option('--input-image-5 <path>', 'Additional reference image (FLUX.2 pro/flex/max)')
    .option('--input-image-6 <path>', 'Additional reference image (FLUX.2 pro/flex/max)')
    .option('--input-image-7 <path>', 'Additional reference image (FLUX.2 pro/flex/max)')
    .option('--input-image-8 <path>', 'Additional reference image (FLUX.2 pro/flex/max)')
    .option('--person <path>', 'Person image (Virtual Try-On)')
    .option('--garment <path>', 'Garment image (Virtual Try-On)');

  // FLUX.1 Expand [pro] specific
  program
    .option('--top <number>', 'Pixels to expand at top (0-2048, default: 0)', parseInt)
    .option('--bottom <number>', 'Pixels to expand at bottom (0-2048, default: 0)', parseInt)
    .option('--left <number>', 'Pixels to expand on left (0-2048, default: 0)', parseInt)
    .option('--right <number>', 'Pixels to expand on right (0-2048, default: 0)', parseInt);

  // Finetune specific
  program
    .option('--finetune-id <id>', 'Fine-tuned model ID (Fill finetune, Ultra finetune)')
    .option('--finetune-strength <number>', 'Finetune strength (0-2)', parseFloat);

  // FLUX Tools (image)
  program
    .option('--dilate-pixels <number>', 'Erase: dilate the mask by N pixels (0-25, default: 10)', parseInt)
    .option('--auto-crop', 'Outpaint: crop the input to the canvas instead of erroring')
    .option('--reference-offset-x <number>', 'Outpaint: left offset of the image on the canvas (px)', parseInt)
    .option('--reference-offset-y <number>', 'Outpaint: top offset of the image on the canvas (px)', parseInt)
    .option('--outpaint-mode <mode>', 'Outpaint: high (default) or fast');

  // Video
  program
    .option('--video-mode <mode>', 'FLUX 3 Video mode: t2v, i2v, v2v, draft_enhance')
    .option('--keyframe <spec...>', 'i2v keyframes: path/URL, or seconds:path for timed frames')
    .option('--start-video <path>', 'v2v: video to continue (file path or URL)')
    .option('--draft-cache <path>', 'draft_enhance: the draft .bin file (or its URL)')
    .option('--duration <seconds>', 'Video duration in whole seconds (5-20; v2v 5-15) or auto')
    .option('--resolution <tier>', 'Video resolution: hd (default), fhd, qhd, uhd')
    .option('--no-audio', 'Do not generate synchronized audio')
    .option('--draft', 'Fast draft render; returns a draft_cache for later enhancement')
    .option('--video <path>', 'Video Edit: video to edit (file path or URL)')
    .option('--input-video <path>', 'Video Upscale: video to upscale (file path or URL)')
    .option('--creativity <0|1>', 'Video Upscale: 0 preserve source, 1 enhance detail (default: 1)', parseInt)
    .option('--upscale-factor <number>', 'Video Upscale: 1.5-3 (default: 2)', parseFloat);

  // Utility options
  program
    .option('--api-key <key>', 'BFL API key (overrides env vars and config files)')
    .option('--examples', 'Show usage examples and exit')
    .option('--credits', 'Check account credits balance')
    .option('--list-finetunes', 'List all your fine-tuned models')
    .option('--finetune-details <id>', 'Show training parameters for a finetune')
    .option('--delete-finetune <id>', 'Delete a finetune (requires --yes)')
    .option('--yes', 'Confirm a destructive action')
    .option('--get-result <id>', 'Poll specific task ID for result')
    .option('--polling-url <url>', 'Regional polling URL from the submit response / metadata (with --get-result)')
    .option('--timeout <seconds>', 'Maximum wait time (default: 300 image, 900 video)', parseInt)
    .option('--output-dir <path>', 'Custom output directory')
    .option('--log-level <level>', 'Logging level (DEBUG, INFO, WARNING, ERROR)', 'INFO')
    .option('--dry-run', 'Preview without generating');

  program.parse();

  const options = program.opts() as CliOptions;

  // Set logging level
  setLogLevel(options.logLevel);

  // Handle examples
  if (options.examples) {
    showExamples();
    process.exit(0);
  }

  // Show help if no arguments
  if (!process.argv.slice(2).length) {
    program.outputHelp();
    process.exit(0);
  }

  // Utility commands: each constructs the API, runs, and exits.
  const utility = async (label: string, run: (api: BflAPI) => Promise<void>): Promise<never> => {
    try {
      const api = new BflAPI({ apiKey: options.apiKey, logLevel: options.logLevel });
      await run(api);
      process.exit(0);
    } catch (error) {
      const err = error as Error;
      logger.error(`Failed to ${label}: ${err.message}`);
      process.exit(1);
    }
  };

  if (options.credits) {
    await utility('fetch credits', async (api) => {
      const credits = await api.getUserCredits();
      logger.info('');
      logger.info('Account Credits:');
      logger.info(`  Credits: ${credits.credits}`);
      logger.info('');
    });
  }

  if (options.listFinetunes) {
    await utility('fetch finetunes', async (api) => {
      const { finetunes } = await api.getMyFinetunes();
      logger.info('');
      logger.info('Your Fine-tuned Models:');
      if (finetunes && finetunes.length > 0) {
        finetunes.forEach((finetune, index) => {
          logger.info(`  ${index + 1}. ${finetune}`);
        });
      } else {
        logger.info('  No fine-tuned models found.');
      }
      logger.info('');
    });
  }

  if (options.finetuneDetails) {
    await utility('fetch finetune details', async (api) => {
      const details = await api.getFinetuneDetails(options.finetuneDetails as string);
      logger.info('');
      logger.info(JSON.stringify(details, null, 2));
      logger.info('');
    });
  }

  if (options.deleteFinetune) {
    if (!options.yes) {
      logger.error(
        `Refusing to delete finetune "${options.deleteFinetune}" without --yes (deletion is irreversible)`
      );
      process.exit(1);
    }
    await utility('delete finetune', async (api) => {
      const result = await api.deleteFinetune(options.deleteFinetune as string);
      logger.info('');
      logger.info(`${result.status}: ${result.message} (${result.deleted_finetune_id})`);
      logger.info('');
    });
  }

  if (options.getResult) {
    await utility('get result', async (api) => {
      const result = await api.getResult(options.getResult as string, options.pollingUrl ?? null);
      logger.info('');
      logger.info(JSON.stringify(result, null, 2));
      logger.info('');
    });
  }

  // Validate model selection
  let model: ModelEndpointKey | null;
  try {
    model = getSelectedModel(options);
  } catch (error) {
    logger.error((error as Error).message);
    process.exit(1);
  }
  if (!model) {
    // Say what is wrong before dumping ~130 lines of help — otherwise the user
    // has to infer the cause from a wall of text with no diagnostic in it.
    logger.error(
      `Invalid input: no model selected. Pass exactly one model flag, e.g. --flux-2-pro (image) or --flux-3-video (video).`
    );
    logger.error('Run `bfl --help` for the full list, or `bfl --examples` for one example per model.');
    process.exit(1);
  }

  // Validate prompts
  const prompts = options.prompt && options.prompt.length > 0 ? options.prompt : [''];
  if (prompts[0] === '' && !PROMPT_OPTIONAL.has(model) && options.videoMode !== 'draft_enhance') {
    logger.error(`Invalid input: ${MODELS[model].label} requires --prompt`);
    process.exit(1);
  }

  // Validate inputs
  try {
    validateInputs(model, options);
  } catch (error) {
    const err = error as Error;
    logger.error(err.message);
    process.exit(1);
  }

  // Print configuration
  logger.info('='.repeat(60));
  logger.info(`BFL ${MODELS[model].media.toUpperCase()} GENERATION`);
  logger.info('='.repeat(60));
  logger.info(`Model: ${model}`);
  logger.info(`Prompts: ${prompts.length}`);
  logger.info(`Dry run: ${options.dryRun || false}`);
  logger.info(`Log level: ${options.logLevel}`);
  logger.info('');

  try {
    // Initialize API
    logger.info('Initializing BFL API...');
    const api = new BflAPI({ apiKey: options.apiKey, logLevel: options.logLevel });
    logger.info('API initialized successfully');
    logger.info('');

    // Process each prompt sequentially
    const results: GenerationResult[] = [];
    for (let i = 0; i < prompts.length; i++) {
      const result = await generate(api, model, prompts[i], options, i, prompts.length);
      results.push(result);

      // Small pause between generations in batch mode
      if (i < prompts.length - 1 && !options.dryRun) {
        logger.info('Pausing before next generation...');
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    // Summary
    logger.info('');
    logger.info('='.repeat(60));
    logger.info('EXECUTION SUMMARY');
    logger.info('='.repeat(60));

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    logger.info(`Total prompts: ${results.length}`);
    logger.info(`Successful: ${successful}`);
    logger.info(`Failed: ${failed}`);

    if (!options.dryRun && successful > 0) {
      logger.info('');
      logger.info('Generated outputs:');
      results
        .filter((r) => r.success && r.outputPath)
        .forEach((r) => {
          logger.info(`  - ${r.outputPath}`);
        });
    }

    if (failed > 0) {
      logger.info('');
      logger.info('Failed prompts:');
      results
        .filter((r) => !r.success)
        .forEach((r) => {
          logger.info(`  - "${r.prompt}": ${r.error}`);
        });
    }

    logger.info('='.repeat(60));

    // Exit with appropriate code
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    const err = error as Error;
    logger.error('');
    logger.error(`Fatal error: ${err.message}`);
    if (options.logLevel === 'DEBUG') {
      logger.debug(err.stack || '');
    }
    process.exit(1);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  logger.warn('\n\nExecution interrupted by user (Ctrl+C)');
  process.exit(1);
});

// Run main
main();
