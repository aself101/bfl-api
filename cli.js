#!/usr/bin/env node

/**
 * BFL Image Generation - Main CLI Script
 *
 * Command-line tool for generating images using Black Forest Labs API.
 * Supports batch processing with multiple prompts and all 6 BFL models.
 *
 * Usage:
 *   bfl --flux-dev --prompt "a cat" --width 1024 --height 768
 *   bfl --flux-ultra --prompt "landscape" --aspect-ratio "21:9" --raw
 *   bfl --flux-fill --prompt "add grass" --image ./photo.jpg --mask ./mask.png
 *   bfl --kontext-pro --prompt "edit this" --input-image ./photo.jpg
 *
 * Or with npm:
 *   npm run bfl -- --flux-dev --prompt "a cat" --width 1024 --height 768
 *
 * Models:
 *   --flux-dev         FLUX.1 [dev] - Full control over steps and guidance
 *   --flux-pro         FLUX 1.1 [pro] - Professional quality with Redux
 *   --flux-ultra       FLUX 1.1 [pro] Ultra - Aspect ratios and raw mode
 *   --flux-fill        FLUX.1 Fill [pro] - Inpainting with masks
 *   --kontext-pro      Kontext Pro - Multi-reference image editing
 *   --kontext-max      Kontext Max - Maximum quality editing
 */

import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';
import { BflAPI } from './api.js';
import {
  imageToBase64,
  downloadImage,
  promptToFilename,
  generateTimestampedFilename,
  writeToFile,
  ensureDirectory,
  setLogLevel,
  logger
} from './utils.js';
import { getOutputDir } from './config.js';

// ES module dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Display usage examples.
 */
function showExamples() {
  console.log(`
${'='.repeat(60)}
BFL IMAGE GENERATION - USAGE EXAMPLES
${'='.repeat(60)}

1. FLUX.1 [dev] - Basic text-to-image
   $ npm run bfl -- --flux-dev \\
       --prompt "a serene mountain landscape at sunset" \\
       --width 1024 --height 768 \\
       --steps 28 --guidance 3

2. FLUX.1 [dev] - High detail with more steps
   $ npm run bfl -- --flux-dev \\
       --prompt "photorealistic portrait of an astronaut" \\
       --width 1024 --height 1024 \\
       --steps 50 --guidance 4 \\
       --seed 42

3. FLUX 1.1 [pro] - Professional quality
   $ npm run bfl -- --flux-pro \\
       --prompt "modern minimalist interior design" \\
       --width 1024 --height 768 \\
       --prompt-upsampling

4. FLUX 1.1 [pro] - Redux image-to-image
   $ npm run bfl -- --flux-pro \\
       --prompt "same style but at night with city lights" \\
       --image-prompt ./reference.jpg \\
       --width 1024 --height 1024

5. FLUX 1.1 [pro] Ultra - Cinematic wide format
   $ npm run bfl -- --flux-ultra \\
       --prompt "epic cinematic landscape, golden hour" \\
       --aspect-ratio "21:9" \\
       --raw

6. FLUX Ultra - Image remixing with strength control
   $ npm run bfl -- --flux-ultra \\
       --prompt "transform into oil painting style" \\
       --image-prompt ./photo.jpg \\
       --image-prompt-strength 0.5 \\
       --aspect-ratio "16:9"

7. FLUX.1 Fill [pro] - Inpainting with mask
   $ npm run bfl -- --flux-fill \\
       --prompt "fill with lush green grass and flowers" \\
       --image ./photo.jpg \\
       --mask ./mask.png \\
       --steps 30 --guidance 5

8. FLUX.1 Fill [pro] - Auto-mask inpainting
   $ npm run bfl -- --flux-fill \\
       --prompt "replace the sky with sunset colors" \\
       --image ./landscape.jpg \\
       --steps 25

9. Kontext Pro - Image editing
   $ npm run bfl -- --kontext-pro \\
       --prompt "make it look like winter, add snow" \\
       --input-image ./summer_photo.jpg

10. Kontext Pro - Multi-reference editing
    $ npm run bfl -- --kontext-pro \\
        --prompt "combine the style from image 2 with subject from image 1" \\
        --input-image ./subject.jpg \\
        --input-image-2 ./style_reference.jpg

11. Kontext Max - Premium quality editing
    $ npm run bfl -- --kontext-max \\
        --prompt "enhance colors, increase contrast, professional grade" \\
        --input-image ./photo.jpg \\
        --output-format png

12. Batch generation - Multiple prompts
    $ npm run bfl -- --flux-dev \\
        --prompt "a red sports car" \\
        --prompt "a blue vintage car" \\
        --prompt "a green electric car" \\
        --seed 42 --width 1024 --height 768

13. Batch with different seeds for variation
    $ npm run bfl -- --flux-ultra \\
        --prompt "abstract art, vibrant colors" \\
        --prompt "abstract art, vibrant colors" \\
        --prompt "abstract art, vibrant colors" \\
        --aspect-ratio "1:1"
    # Each will generate differently without seed

14. Custom output directory
    $ npm run bfl -- --flux-dev \\
        --prompt "logo design for tech startup" \\
        --output-dir ./my-generations \\
        --output-format png

15. Dry run to preview parameters
    $ npm run bfl -- --flux-ultra \\
        --prompt "test prompt" \\
        --aspect-ratio "21:9" --raw \\
        --dry-run

16. Check account credits
    $ npm run bfl:credits
    # or
    $ npm run bfl -- --credits

17. Poll existing task
    $ npm run bfl -- --get-result abc123def456

AUTHENTICATION OPTIONS:

A. CLI flag (highest priority)
   $ bfl --api-key YOUR_KEY --flux-dev --prompt "test"

B. Environment variable
   $ export BFL_API_KEY=YOUR_KEY
   $ bfl --flux-dev --prompt "test"

C. Local .env file (current directory)
   $ echo "BFL_API_KEY=YOUR_KEY" > .env
   $ bfl --flux-dev --prompt "test"

D. Global config (for global installs)
   $ mkdir -p ~/.bfl && echo "BFL_API_KEY=YOUR_KEY" > ~/.bfl/.env
   $ bfl --flux-dev --prompt "test"

${'='.repeat(60)}
`);
}

/**
 * Get the model name from command options.
 *
 * @param {Object} options - Parsed command options
 * @returns {string|null} Model name or null if none selected
 */
function getSelectedModel(options) {
  if (options.fluxDev) return 'flux-dev';
  if (options.fluxPro) return 'flux-pro';
  if (options.fluxUltra) return 'flux-ultra';
  if (options.fluxFill) return 'flux-pro-fill';
  if (options.kontextPro) return 'kontext-pro';
  if (options.kontextMax) return 'kontext-max';
  return null;
}

/**
 * Build parameters for FLUX.1 [dev] model.
 *
 * @param {Object} params - Base parameters object
 * @param {Object} options - Command options
 */
function buildFluxDevParams(params, options) {
  if (options.width) params.width = options.width;
  if (options.height) params.height = options.height;
  if (options.steps) params.steps = options.steps;
  if (options.guidance) params.guidance = options.guidance;
  if (options.promptUpsampling !== undefined) params.prompt_upsampling = options.promptUpsampling;
}

/**
 * Build parameters for FLUX 1.1 [pro] model.
 *
 * @param {Object} params - Base parameters object
 * @param {Object} options - Command options
 */
function buildFluxProParams(params, options) {
  if (options.width) params.width = options.width;
  if (options.height) params.height = options.height;
  if (options.promptUpsampling !== undefined) params.prompt_upsampling = options.promptUpsampling;
}

/**
 * Build parameters for FLUX Ultra model.
 *
 * @param {Object} params - Base parameters object
 * @param {Object} options - Command options
 */
function buildFluxUltraParams(params, options) {
  if (options.aspectRatio) params.aspect_ratio = options.aspectRatio;
  if (options.raw !== undefined) params.raw = options.raw;
  if (options.imagePromptStrength !== undefined) params.image_prompt_strength = options.imagePromptStrength;
}

/**
 * Build parameters for FLUX.1 Fill [pro] model.
 *
 * @param {Object} params - Base parameters object
 * @param {Object} options - Command options
 */
function buildFluxProFillParams(params, options) {
  if (options.steps) params.steps = options.steps;
  if (options.guidance !== undefined) params.guidance = options.guidance;
  if (options.promptUpsampling !== undefined) params.prompt_upsampling = options.promptUpsampling;
}

/**
 * Add common parameters shared across all models.
 *
 * @param {Object} params - Parameters object to modify
 * @param {Object} options - Command options
 */
function addCommonParams(params, options) {
  if (options.seed !== undefined) params.seed = options.seed;
  if (options.safetyTolerance !== undefined) params.safety_tolerance = options.safetyTolerance;
  if (options.outputFormat) params.output_format = options.outputFormat;
}

/**
 * Convert image inputs to base64 and add to parameters.
 *
 * @param {Object} params - Parameters object to modify
 * @param {Object} options - Command options
 * @returns {Promise<void>}
 */
async function addImageInputs(params, options) {
  if (options.imagePrompt) {
    logger.info('Converting image prompt to base64...');
    params.image_prompt = await imageToBase64(options.imagePrompt);
  }

  if (options.image) {
    logger.info('Converting image to base64...');
    params.image = await imageToBase64(options.image);
  }

  if (options.mask) {
    logger.info('Converting mask to base64...');
    params.mask = await imageToBase64(options.mask);
  }

  if (options.inputImage) {
    logger.info('Converting input image to base64...');
    params.input_image = await imageToBase64(options.inputImage);
  }

  if (options.inputImage2) {
    logger.info('Converting input image 2 to base64...');
    params.input_image_2 = await imageToBase64(options.inputImage2);
  }

  if (options.inputImage3) {
    logger.info('Converting input image 3 to base64...');
    params.input_image_3 = await imageToBase64(options.inputImage3);
  }

  if (options.inputImage4) {
    logger.info('Converting input image 4 to base64...');
    params.input_image_4 = await imageToBase64(options.inputImage4);
  }
}

/**
 * Process a single image generation request.
 *
 * @param {BflAPI} api - Initialized BflAPI instance
 * @param {string} model - Model name
 * @param {string} prompt - Generation prompt
 * @param {Object} options - Command options
 * @param {number} index - Prompt index (for batch processing)
 * @param {number} total - Total number of prompts
 * @returns {Promise<Object>} Result with success status and metadata
 */
async function generateImage(api, model, prompt, options, index, total) {
  const batchPrefix = total > 1 ? `[${index + 1}/${total}] ` : '';

  logger.info('='.repeat(60));
  logger.info(`${batchPrefix}Starting image generation`);
  logger.info(`Model: ${model}`);
  logger.info(`Prompt: "${prompt}"`);
  logger.info('='.repeat(60));

  try {
    // Prepare parameters based on model
    const params = { prompt };

    // Convert image inputs to base64
    await addImageInputs(params, options);

    // Add common parameters
    addCommonParams(params, options);

    // Add model-specific parameters
    if (model === 'flux-dev') {
      buildFluxDevParams(params, options);
    } else if (model === 'flux-pro') {
      buildFluxProParams(params, options);
    } else if (model === 'flux-ultra') {
      buildFluxUltraParams(params, options);
    } else if (model === 'flux-pro-fill') {
      buildFluxProFillParams(params, options);
    }
    // Note: Kontext models don't have additional parameters beyond common ones

    // Dry run check
    if (options.dryRun) {
      logger.info('[DRY RUN] Would generate with parameters:');
      logger.info(JSON.stringify(params, null, 2));
      logger.info('[DRY RUN] Skipping actual generation');
      return { success: true, dryRun: true };
    }

    // Submit generation request
    logger.info('Submitting generation request...');
    let task;

    if (model === 'flux-dev') {
      task = await api.generateFluxDev(params);
    } else if (model === 'flux-pro') {
      task = await api.generateFluxPro(params);
    } else if (model === 'flux-ultra') {
      task = await api.generateFluxProUltra(params);
    } else if (model === 'flux-pro-fill') {
      task = await api.generateFluxProFill(params);
    } else if (model === 'kontext-pro') {
      task = await api.generateKontextPro(params);
    } else if (model === 'kontext-max') {
      task = await api.generateKontextMax(params);
    }

    logger.info(`Task submitted: ${task.id}`);
    logger.info(`Polling URL: ${task.polling_url || 'N/A'}`);

    // Wait for result with auto-polling
    const result = await api.waitForResult(task.id, {
      pollingUrl: task.polling_url || null,
      timeout: options.timeout || 300,
      pollInterval: 2,
      showSpinner: true
    });

    // Save result
    const outputDir = options.outputDir || getOutputDir();
    const modelDir = path.join(outputDir, model);
    await ensureDirectory(modelDir);

    // Generate filename
    const safePrompt = promptToFilename(prompt);
    const extension = params.output_format || 'jpeg';
    const imageFilename = generateTimestampedFilename(safePrompt, extension === 'jpeg' ? 'jpg' : extension);
    const imagePath = path.join(modelDir, imageFilename);

    // Download image
    logger.info('Downloading generated image...');
    await downloadImage(result.result.sample, imagePath);
    logger.info(`✓ Image saved: ${imagePath}`);

    // Save metadata
    const metadataFilename = imageFilename.replace(/\.(jpg|png)$/, '_metadata.json');
    const metadataPath = path.join(modelDir, metadataFilename);
    const metadata = {
      task_id: task.id,
      model: model,
      timestamp: new Date().toISOString(),
      parameters: params,
      result: {
        status: result.status,
        image_url: result.result.sample,
        image_path: imagePath
      }
    };
    await writeToFile(metadata, metadataPath, 'json');
    logger.info(`✓ Metadata saved: ${metadataPath}`);

    logger.info('='.repeat(60));
    logger.info(`${batchPrefix}✓ Generation complete!`);
    logger.info('='.repeat(60));

    return {
      success: true,
      taskId: task.id,
      imagePath,
      metadataPath,
      metadata
    };

  } catch (error) {
    logger.error('='.repeat(60));
    logger.error(`${batchPrefix}✗ Generation failed: ${error.message}`);
    logger.error('='.repeat(60));

    return {
      success: false,
      error: error.message,
      prompt
    };
  }
}

/**
 * Validate CLI parameters based on model requirements.
 *
 * @param {string} model - Model name
 * @param {Object} options - Parsed command options
 * @throws {Error} If parameters are invalid
 */
function validateParameters(model, options) {
  const errors = [];

  // Validate dimensions (FLUX.1 dev and FLUX 1.1 pro)
  if (model === 'flux-dev' || model === 'flux-pro') {
    if (options.width !== undefined) {
      if (options.width < 256 || options.width > 1440) {
        errors.push('Width must be between 256 and 1440');
      }
      if (options.width % 32 !== 0) {
        errors.push('Width must be a multiple of 32');
      }
    }

    if (options.height !== undefined) {
      if (options.height < 256 || options.height > 1440) {
        errors.push('Height must be between 256 and 1440');
      }
      if (options.height % 32 !== 0) {
        errors.push('Height must be a multiple of 32');
      }
    }
  }

  // Validate FLUX.1 dev specific parameters
  if (model === 'flux-dev') {
    if (options.steps !== undefined) {
      if (options.steps < 1 || options.steps > 50) {
        errors.push('Steps must be between 1 and 50');
      }
    }

    if (options.guidance !== undefined) {
      if (options.guidance < 1.5 || options.guidance > 5) {
        errors.push('Guidance must be between 1.5 and 5');
      }
    }
  }

  // Validate FLUX.1 Fill [pro] specific parameters
  if (model === 'flux-pro-fill') {
    if (options.steps !== undefined) {
      if (options.steps < 15 || options.steps > 50) {
        errors.push('Steps must be between 15 and 50 for FLUX.1 Fill [pro]');
      }
    }

    if (options.guidance !== undefined) {
      if (options.guidance < 1.5 || options.guidance > 100) {
        errors.push('Guidance must be between 1.5 and 100 for FLUX.1 Fill [pro]');
      }
    }

    if (!options.image) {
      errors.push('--image is required for FLUX.1 Fill [pro]');
    }
  }

  // Validate safety tolerance
  if (options.safetyTolerance !== undefined) {
    if (options.safetyTolerance < 0 || options.safetyTolerance > 6) {
      errors.push('Safety tolerance must be between 0 and 6');
    }
  }

  // Validate aspect ratio format (FLUX Ultra)
  if (model === 'flux-ultra' && options.aspectRatio) {
    const validRatios = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', '9:21'];
    if (!validRatios.includes(options.aspectRatio)) {
      errors.push(`Aspect ratio must be one of: ${validRatios.join(', ')}`);
    }
  }

  // Validate image prompt strength (FLUX Ultra)
  if (model === 'flux-ultra' && options.imagePromptStrength !== undefined) {
    if (options.imagePromptStrength < 0 || options.imagePromptStrength > 1) {
      errors.push('Image prompt strength must be between 0 and 1');
    }
  }

  // Validate output format
  if (options.outputFormat) {
    const validFormats = ['jpeg', 'png'];
    if (!validFormats.includes(options.outputFormat)) {
      errors.push(`Output format must be one of: ${validFormats.join(', ')}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Parameter validation failed:\n  - ${errors.join('\n  - ')}`);
  }
}

/**
 * Main execution function.
 */
async function main() {
  const program = new Command();

  program
    .name('bfl')
    .description('Generate images using Black Forest Labs API')
    .version('1.0.0');

  // Model selection (mutually exclusive)
  program
    .option('--flux-dev', 'Use FLUX.1 [dev] model (full control over steps/guidance)')
    .option('--flux-pro', 'Use FLUX 1.1 [pro] model (professional quality with Redux)')
    .option('--flux-ultra', 'Use FLUX 1.1 [pro] Ultra model (aspect ratios and raw mode)')
    .option('--flux-fill', 'Use FLUX.1 Fill [pro] model (inpainting with masks)')
    .option('--kontext-pro', 'Use Kontext Pro model (multi-reference editing)')
    .option('--kontext-max', 'Use Kontext Max model (maximum quality editing)');

  // Common parameters
  program
    .option('--prompt <text...>', 'Text prompt(s) for generation (can specify multiple)', [])
    .option('--seed <number>', 'Random seed for reproducibility', parseInt)
    .option('--safety-tolerance <number>', 'Content moderation level (0-6, default: 2)', parseInt)
    .option('--output-format <format>', 'Output format: jpeg or png (default: jpeg)')
    .option('--prompt-upsampling', 'Enable AI prompt enhancement');

  // FLUX.1 [dev] specific
  program
    .option('--width <number>', 'Image width (256-1440, multiple of 32)', parseInt)
    .option('--height <number>', 'Image height (256-1440, multiple of 32)', parseInt)
    .option('--steps <number>', 'Inference steps (1-50, default: 28)', parseInt)
    .option('--guidance <number>', 'Guidance scale (1.5-5, default: 3)', parseFloat);

  // FLUX Ultra specific
  program
    .option('--aspect-ratio <ratio>', 'Aspect ratio (e.g., 16:9, 21:9, 1:1)')
    .option('--raw', 'Enable raw/natural mode');

  // Image inputs
  program
    .option('--image-prompt <path>', 'Input image for Redux/remix (file path or URL)')
    .option('--image-prompt-strength <number>', 'Remix strength for Ultra (0-1, default: 0.1)', parseFloat)
    .option('--image <path>', 'Input image for Fill inpainting (file path or URL)')
    .option('--mask <path>', 'Mask image for Fill inpainting (file path or URL, optional)')
    .option('--input-image <path>', 'Primary input image for Kontext (file path or URL)')
    .option('--input-image-2 <path>', 'Additional reference image for Kontext')
    .option('--input-image-3 <path>', 'Additional reference image for Kontext')
    .option('--input-image-4 <path>', 'Additional reference image for Kontext');

  // Utility options
  program
    .option('--api-key <key>', 'BFL API key (overrides env vars and config files)')
    .option('--examples', 'Show usage examples and exit')
    .option('--credits', 'Check account credits balance')
    .option('--get-result <id>', 'Poll specific task ID for result')
    .option('--timeout <seconds>', 'Maximum wait time (default: 300)', parseInt)
    .option('--output-dir <path>', 'Custom output directory')
    .option('--log-level <level>', 'Logging level (DEBUG, INFO, WARNING, ERROR)', 'INFO')
    .option('--dry-run', 'Preview without generating');

  program.parse();

  const options = program.opts();

  // Set logging level
  setLogLevel(options.logLevel);

  // Handle examples
  if (options.examples) {
    showExamples();
    process.exit(0);
  }

  // Handle credits check
  if (options.credits) {
    try {
      const api = new BflAPI({ apiKey: options.apiKey, logLevel: options.logLevel });
      const credits = await api.getUserCredits();
      logger.info('');
      logger.info('Account Credits:');
      logger.info(`  Credits: ${credits.credits}`);
      logger.info('');
      process.exit(0);
    } catch (error) {
      logger.error(`Failed to fetch credits: ${error.message}`);
      process.exit(1);
    }
  }

  // Handle get-result
  if (options.getResult) {
    try {
      const api = new BflAPI({ apiKey: options.apiKey, logLevel: options.logLevel });
      const result = await api.getResult(options.getResult);
      logger.info('');
      logger.info(JSON.stringify(result, null, 2));
      logger.info('');
      process.exit(0);
    } catch (error) {
      logger.error(`Failed to get result: ${error.message}`);
      process.exit(1);
    }
  }

  // Validate model selection
  const model = getSelectedModel(options);
  if (!model) {
    logger.error('Error: Please specify a model (--flux-dev, --flux-pro, --flux-ultra, --kontext-pro, or --kontext-max)');
    program.help();
  }

  // Validate prompts
  if (!options.prompt || options.prompt.length === 0) {
    logger.error('Error: At least one --prompt is required');
    program.help();
  }

  // Validate Kontext models require input image
  if ((model === 'kontext-pro' || model === 'kontext-max') && !options.inputImage) {
    logger.error(`Error: ${model} requires --input-image`);
    process.exit(1);
  }

  // Validate parameters
  try {
    validateParameters(model, options);
  } catch (error) {
    logger.error(`Error: ${error.message}`);
    process.exit(1);
  }

  // Print configuration
  logger.info('='.repeat(60));
  logger.info('BFL IMAGE GENERATION');
  logger.info('='.repeat(60));
  logger.info(`Model: ${model}`);
  logger.info(`Prompts: ${options.prompt.length}`);
  logger.info(`Dry run: ${options.dryRun || false}`);
  logger.info(`Log level: ${options.logLevel}`);
  logger.info('');

  try {
    // Initialize API
    logger.info('Initializing BFL API...');
    const api = new BflAPI({ apiKey: options.apiKey, logLevel: options.logLevel });
    logger.info('✓ API initialized successfully');
    logger.info('');

    // Process each prompt sequentially
    const results = [];
    for (let i = 0; i < options.prompt.length; i++) {
      const prompt = options.prompt[i];
      const result = await generateImage(api, model, prompt, options, i, options.prompt.length);
      results.push(result);

      // Small pause between generations in batch mode
      if (i < options.prompt.length - 1 && !options.dryRun) {
        logger.info('Pausing before next generation...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Summary
    logger.info('');
    logger.info('='.repeat(60));
    logger.info('EXECUTION SUMMARY');
    logger.info('='.repeat(60));

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    logger.info(`Total prompts: ${results.length}`);
    logger.info(`Successful: ${successful}`);
    logger.info(`Failed: ${failed}`);

    if (!options.dryRun && successful > 0) {
      logger.info('');
      logger.info('Generated images:');
      results.filter(r => r.success && r.imagePath).forEach(r => {
        logger.info(`  - ${r.imagePath}`);
      });
    }

    if (failed > 0) {
      logger.info('');
      logger.info('Failed prompts:');
      results.filter(r => !r.success).forEach(r => {
        logger.info(`  - "${r.prompt}": ${r.error}`);
      });
    }

    logger.info('='.repeat(60));

    // Exit with appropriate code
    process.exit(failed > 0 ? 1 : 0);

  } catch (error) {
    logger.error('');
    logger.error(`Fatal error: ${error.message}`);
    if (options.logLevel === 'DEBUG') {
      logger.debug(error.stack);
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
