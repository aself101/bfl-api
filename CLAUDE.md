# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains an npm package providing a Node.js wrapper for the Black Forest Labs Image Generation API. The package enables easy access to FLUX and Kontext models for AI image generation.

**Package Name**: `bfl-api`
**Version**: 1.0.0
**License**: MIT
**Purpose**: Programmatic and CLI access to Black Forest Labs image generation models

## Project Structure

```
bfl-api/
├── package.json       # npm package config, scripts, dependencies
├── cli.js            # CLI orchestration script (bin entry point)
├── api.js            # BflAPI wrapper class (main export)
├── utils.js          # Utility functions (file I/O, image conversion, spinner)
├── config.js         # Configuration and authentication
├── test.js           # Simple test script
├── README.md         # User-facing documentation
├── LICENSE           # MIT License with Extra Silliness
├── CLAUDE.md         # This file - development guidance
├── .env.example      # Environment variable template
├── .npmignore        # npm publish exclusions
├── docs/             # Additional documentation
└── datasets/         # Generated images and metadata (gitignored)
    └── bfl/
        ├── flux-dev/
        ├── flux-pro/
        ├── flux-ultra/
        ├── kontext-pro/
        └── kontext-max/
```

## Core Components

### cli.js - CLI Orchestration
Main executable script (shebang: `#!/usr/bin/env node`). Handles:
- Command-line argument parsing using `commander`
- **Parameter validation** before API calls (saves credits!)
- Batch processing (multiple prompts sequentially)
- Model selection validation
- Dry-run mode
- Image generation orchestration
- Result downloading and metadata saving
- Execution summary reporting

**Key Features**:
- **Pre-flight validation**: Catches invalid parameters (width/height/steps/guidance/aspect-ratio) before making API calls
- **Modular parameter building**: Separate functions for each model's parameters
- Sequential batch processing with 2s delays between requests
- Timestamped filenames with sanitized prompts
- Comprehensive error handling and reporting
- Winston logger integration (no console.log)
- SIGINT (Ctrl+C) graceful shutdown

**Helper Functions** (cli.js:161-243):
- `validateParameters(model, options)` - Validate all parameters against model constraints
- `buildFluxDevParams(params, options)` - FLUX.1 dev parameters
- `buildFluxProParams(params, options)` - FLUX 1.1 pro parameters
- `buildFluxUltraParams(params, options)` - FLUX Ultra parameters
- `addCommonParams(params, options)` - Common parameters (seed, safety, format)
- `addImageInputs(params, options)` - Base64 conversion for image inputs

### api.js - BflAPI Wrapper Class
Main export of the package. Provides typed methods for all BFL models:

**Generation Methods**:
- `generateFluxDev(params)` - FLUX.1 [dev] with full parameter control
- `generateFluxPro(params)` - FLUX 1.1 [pro] with Redux support
- `generateFluxProUltra(params)` - FLUX Ultra with aspect ratios
- `generateKontextPro(params)` - Kontext Pro image editing
- `generateKontextMax(params)` - Kontext Max premium editing

**Utility Methods**:
- `getResult(taskId)` - Single poll for task status
- `waitForResult(taskId, options)` - Auto-polling with retry logic and spinner
- `getUserCredits()` - Check account credits balance

**Features**:
- Automatic API key validation
- Winston logger integration
- Exponential backoff retry logic (max 3 retries)
- Comprehensive error handling (moderation, auth, validation, rate limits)
- Spinner progress indicator during polling

### utils.js - Utility Functions
Shared helper functions for the package:

**File I/O**:
- `writeToFile(data, path, format)` - Supports JSON, JSON.gz, CSV
- `readFromFile(path)` - Auto-detect format and decompress
- `ensureDirectory(path)` - Create directory if not exists

**Image Handling**:
- `imageToBase64(input)` - Convert file path or URL to base64 data URI
- `downloadImage(url, path)` - Download and save image from URL

**Filename Generation**:
- `promptToFilename(prompt)` - Sanitize prompt for filesystem
- `generateTimestampedFilename(base, ext)` - `YYYY-MM-DD_HH-MM-SS_base.ext`

**Progress & Timing**:
- `createSpinner(message)` - Animated CLI spinner
- `pause(seconds)` - Promise-based delay

**Logging**:
- `logger` - Winston logger instance (exported)
- `setLogLevel(level)` - Runtime log level adjustment

### config.js - Configuration Management
Centralized configuration and environment variable handling:

**Constants**:
- `BASE_URL` - Primary API endpoint (`https://api.bfl.ai`)
- `US_BASE_URL` - US region endpoint (`https://api.us1.bfl.ai`)
- `MODEL_ENDPOINTS` - Endpoint paths for all 5 models
- `DEFAULT_POLL_INTERVAL` - 2 seconds
- `DEFAULT_TIMEOUT` - 300 seconds (5 minutes)
- `MAX_RETRIES` - 3 attempts

**Functions**:
- `getBflApiKey()` - Retrieve and validate `BFL_API_KEY` from `.env`
- `validateApiKeyFormat(key)` - Basic format validation (length > 10)
- `getOutputDir()` - Get output directory (default: `datasets/bfl`)
- `getPollInterval()` - Get polling interval from env or default
- `getTimeout()` - Get timeout from env or default

## Package Exports

The package exports the following for programmatic use:

```javascript
// Main API class (default and named export)
import { BflAPI } from 'bfl-api';
import BflAPI from 'bfl-api';  // Also works

// Individual modules
import { BflAPI } from 'bfl-api/api';
import { imageToBase64, downloadImage, writeToFile } from 'bfl-api/utils';
import { getBflApiKey, MODEL_ENDPOINTS, BASE_URL } from 'bfl-api/config';
```

## Authentication

API key is required and loaded from `.env` file:

```bash
# .env
BFL_API_KEY=your_api_key_here
```

To obtain an API key:
1. Visit https://api.bfl.ml/
2. Create an account or sign in
3. Generate API key from dashboard

**Security**: Never commit `.env` file or expose API key publicly. The `.gitignore` includes `.env`.

## Data Organization

Generated images and metadata are organized by model:

```
datasets/bfl/
├── flux-dev/
│   ├── 2025-01-13_14-30-22_mountain_landscape.jpg
│   ├── 2025-01-13_14-30-22_mountain_landscape_metadata.json
│   └── ...
├── flux-pro/
├── flux-ultra/
├── kontext-pro/
└── kontext-max/
```

**Metadata Format**:
```json
{
  "task_id": "abc123",
  "model": "flux-dev",
  "timestamp": "2025-01-13T14:30:22Z",
  "parameters": {
    "prompt": "a serene mountain landscape",
    "width": 1024,
    "height": 768,
    "steps": 28,
    "guidance": 3,
    "seed": 42
  },
  "result": {
    "status": "Ready",
    "image_url": "https://...",
    "image_path": "datasets/bfl/flux-dev/..."
  }
}
```

## Dependencies

Production dependencies (see `package.json`):
- `axios` ^1.6.2 - HTTP client for API requests
- `commander` ^11.1.0 - CLI argument parsing
- `dotenv` ^16.3.1 - Environment variable loading
- `winston` ^3.11.0 - Logging framework

**Node.js Requirement**: >=18.0.0

## Models Supported

The package supports all 5 Black Forest Labs image generation models:

### 1. FLUX.1 [dev] (`flux-dev`)
- **Endpoint**: `/v1/flux-dev`
- **Best for**: Experimentation, fine-tuning parameters
- **Parameters**: width, height, steps (1-50), guidance (1.5-5), seed, prompt_upsampling
- **Dimensions**: 256-1440px, multiples of 32

### 2. FLUX 1.1 [pro] (`flux-pro`)
- **Endpoint**: `/v1/flux-pro-1.1`
- **Best for**: Production, high-quality images, Redux image-to-image
- **Parameters**: width, height, image_prompt (optional Redux), seed, prompt_upsampling
- **Dimensions**: 256-1440px, multiples of 32

### 3. FLUX 1.1 [pro] Ultra (`flux-ultra`)
- **Endpoint**: `/v1/flux-pro-1.1-ultra`
- **Best for**: Cinematic outputs, specific aspect ratios, raw aesthetics
- **Parameters**: aspect_ratio (21:9 to 9:21), raw mode, image_prompt, image_prompt_strength
- **Aspect Ratios**: 21:9, 16:9, 4:3, 1:1, 3:4, 9:16, 9:21

### 4. Kontext Pro (`kontext-pro`)
- **Endpoint**: `/v1/flux-kontext-pro`
- **Best for**: Image editing, multi-reference composition
- **Parameters**: input_image (required), input_image_2-4 (optional), prompt, seed
- **References**: Up to 4 images total (1 primary + 3 additional)

### 5. Kontext Max (`kontext-max`)
- **Endpoint**: `/v1/flux-kontext-max`
- **Best for**: Premium image editing, professional retouching
- **Parameters**: input_image (required), input_image_2-4 (optional), prompt, seed
- **References**: Up to 4 images total (1 primary + 3 additional)

## CLI Usage

The package provides a comprehensive CLI tool via the `bfl` command:

### Installation & Setup
```bash
# Install from source (npm publish coming soon)
npm install

# Create .env file
cp .env.example .env
# Edit .env and add your BFL_API_KEY

# Test installation
npm run bfl:help
npm run bfl:examples
```

### Basic Command Structure
```bash
npm run bfl -- [model] [options]
```

### Common Usage Patterns

**Text-to-Image (FLUX.1 dev)**:
```bash
npm run bfl -- --flux-dev \
  --prompt "a serene mountain landscape" \
  --width 1024 --height 768 \
  --steps 28 --guidance 3
```

**Professional Quality (FLUX Pro)**:
```bash
npm run bfl -- --flux-pro \
  --prompt "professional portrait photo" \
  --width 1024 --height 1024 \
  --prompt-upsampling
```

**Cinematic Wide (FLUX Ultra)**:
```bash
npm run bfl -- --flux-ultra \
  --prompt "epic landscape, golden hour" \
  --aspect-ratio "21:9" \
  --raw
```

**Image Editing (Kontext Pro)**:
```bash
npm run bfl -- --kontext-pro \
  --prompt "make it winter, add snow" \
  --input-image ./photo.jpg
```

**Batch Generation**:
```bash
npm run bfl -- --flux-dev \
  --prompt "a red car" \
  --prompt "a blue car" \
  --prompt "a green car" \
  --seed 42
```

**Utility Commands**:
```bash
npm run bfl:credits          # Check account balance
npm run bfl:examples         # Show 15+ usage examples
npm run bfl -- --get-result <task_id>  # Poll specific task
```

## Programmatic Usage

```javascript
import { BflAPI } from 'bfl-api';
import { imageToBase64 } from 'bfl-api/utils';

// Initialize API
const api = new BflAPI({ logLevel: 'INFO' });

// Generate with FLUX.1 [dev]
const task = await api.generateFluxDev({
  prompt: 'a beautiful sunset',
  width: 1024,
  height: 768,
  steps: 28,
  guidance: 3,
  seed: 42
});

// Wait for result with auto-polling and spinner
const result = await api.waitForResult(task.id, {
  timeout: 300,
  pollInterval: 2,
  showSpinner: true
});

console.log('Image URL:', result.result.sample);

// Edit image with Kontext
const inputImage = await imageToBase64('./photo.jpg');
const editTask = await api.generateKontextPro({
  prompt: 'transform into watercolor painting',
  input_image: inputImage
});

const editResult = await api.waitForResult(editTask.id);
```

## Error Handling

The package implements comprehensive error handling with automatic retries:

### Retry Logic
- **Transient errors** (network, 502, 503) automatically retry with exponential backoff
- **Retry delays**: 2s, 4s, 8s (max 3 attempts)
- **Non-retriable errors**: Content moderation, 401 (auth), 422 (validation), 429 (rate limit)

### Error Types

**Content Moderation (400)**:
```
Error: Content was moderated. Please revise your prompt.
```
- Prompt flagged by safety filters
- Try adjusting `--safety-tolerance` or revising prompt

**Authentication (401)**:
```
Error: Authentication failed. Please check your API key.
```
- Invalid or missing API key
- Verify `BFL_API_KEY` in `.env`

**Validation (422)**:
```
Error: Request contained validation errors: [details]
```
- Invalid parameters (e.g., dimensions not multiple of 32)
- Check parameter constraints for the model

**Rate Limit (429)**:
```
Error: Rate limit exceeded. Please try again later.
```
- Too many requests
- Wait before retrying

**Timeout**:
```
Error: Timeout after 300 seconds
```
- Generation took longer than timeout
- Increase with `--timeout 600`

### Spinner Progress Indicator

During polling, an animated spinner shows progress:
```
⠋ Generating... Pending (12s elapsed, ~288s remaining)
```

On completion:
```
✓ Generation complete! (45.2s)
```

## Development Guidelines

When modifying or extending this package:

### Adding New Models

If BFL releases new models, follow this pattern:

1. **Update `config.js`**: Add endpoint to `MODEL_ENDPOINTS`
   ```javascript
   export const MODEL_ENDPOINTS = {
     'new-model': '/v1/new-model'
   };
   ```

2. **Add method to `api.js`**: Create `generateNewModel(params)` method
   ```javascript
   async generateNewModel(params) {
     this._verifyApiKey();
     const endpoint = MODEL_ENDPOINTS['new-model'];
     const response = await this._makeRequest('POST', endpoint, params);
     return response.data;
   }
   ```

3. **Update `cli.js`**: Add CLI option and orchestration
   ```javascript
   program.option('--new-model', 'Use New Model');
   // Add to getSelectedModel() and generateImage() switch
   ```

4. **Update documentation**: Add to README.md and CLAUDE.md

### Code Style

- **ES Modules**: Use `import/export`, not `require`
- **Async/Await**: Prefer over `.then()` chains
- **Error Handling**: Always wrap API calls in try/catch
- **Logging**: Use Winston logger, not `console.log`
- **Comments**: JSDoc format for all public functions

### Testing

The project uses **Vitest** for testing with comprehensive coverage:

**Test Structure**:
```
test/
├── api.test.js       - BflAPI class tests (14 tests)
├── config.test.js    - Configuration tests (17 tests)
└── utils.test.js     - Utility function tests (12 tests)
```

**Running Tests**:
```bash
# Run all tests (43 tests total)
npm test

# Watch mode for development
npm run test:watch

# Interactive UI in browser
npm run test:ui

# Generate coverage report
npm run test:coverage
```

**Test Configuration** (`vitest.config.js`):
- Coverage thresholds: 70% for lines/functions/branches/statements
- Excludes: cli.js (interactive), test files, datasets, docs
- Timeout: 10s per test
- Reporter: verbose

**Manual Testing**:
```bash
# Dry run to validate parameters
npm run bfl -- --flux-dev --prompt "test" --dry-run

# Test parameter validation (should error)
npm run bfl -- --flux-dev --prompt "test" --width 999 --dry-run

# Check API connectivity
npm run bfl:credits

# Small test generation
npm run bfl -- --flux-dev --prompt "test" --width 512 --height 512
```

### Security Considerations

1. **API Key Protection**:
   - Never log API keys
   - Never commit `.env` to git
   - `.env` is in `.gitignore`

2. **Input Validation**:
   - User prompts are sanitized for filenames
   - File paths validated before reading
   - URLs validated before downloading

3. **Rate Limiting**:
   - 2s delays between batch requests
   - Respect API rate limits
   - Exponential backoff on errors

### Publishing to npm

When ready to publish:

1. **Update version** in `package.json`
2. **Test package locally**:
   ```bash
   npm pack
   npm install -g bfl-api-1.0.0.tgz
   bfl --help
   ```
3. **Publish**:
   ```bash
   npm login
   npm publish
   ```

Files excluded from npm package (see `.npmignore`):
- `.env`, `.env.example`
- `test.js`
- `datasets/`
- `docs/`
- `.git`, `.gitignore`

## Logging

Winston logger with levels: DEBUG, INFO, WARN, ERROR

**CLI Log Level**:
```bash
npm run bfl -- --log-level DEBUG --flux-dev --prompt "test"
```

**Programmatic Log Level**:
```javascript
const api = new BflAPI({ logLevel: 'DEBUG' });
```

**Log Format**:
```
2025-01-13T14:30:22Z - INFO - BflAPI initialized successfully
2025-01-13T14:30:23Z - INFO - Submitting generation request...
2025-01-13T14:30:24Z - DEBUG - Response: {"id":"abc123",...}
```

## File Organization Best Practices

When working with this codebase:

1. **Generated images**: Stay in `datasets/bfl/` (gitignored)
2. **Documentation**: User-facing in `README.md`, developer guidance in `CLAUDE.md`
3. **Configuration**: API settings in `config.js`, secrets in `.env`
4. **Utilities**: Reusable functions in `utils.js` with clear naming
5. **API methods**: One method per endpoint, clear parameter validation

## Common Tasks

### Adding a New CLI Option

1. Add to `cli.js` program options:
   ```javascript
   program.option('--new-option <value>', 'Description');
   ```

2. Handle in `generateImage()` function:
   ```javascript
   if (options.newOption) {
     params.new_option = options.newOption;
   }
   ```

3. Document in `--help` output and README

### Adding a New Utility Function

1. Add to `utils.js` with JSDoc:
   ```javascript
   /**
    * Description of function.
    * @param {Type} param - Description
    * @returns {Type} Description
    */
   export function myUtility(param) {
     // Implementation
   }
   ```

2. Export from `package.json` exports if needed
3. Add tests to appropriate test file in `/test` directory

### Debugging API Issues

Enable DEBUG logging:
```bash
npm run bfl -- --log-level DEBUG --flux-dev --prompt "test" --dry-run
```

Check API response:
```bash
# Get raw result
npm run bfl -- --get-result <task_id>
```

Verify credentials:
```bash
npm run bfl:credits
```

## Resources

- **BFL API Docs**: https://docs.bfl.ml/
- **BFL Website**: https://blackforestlabs.ai/
- **FLUX Models**: https://blackforestlabs.ai/flux-models/
- **API Status**: https://status.bfl.ml/
- **Get API Key**: https://api.bfl.ml/

## Recent Improvements (v1.0.0)

### Code Quality Enhancements
1. **Parameter Validation** (cli.js:330-402)
   - Pre-flight validation for all CLI parameters
   - Catches invalid values before API calls (saves credits)
   - Clear error messages with specific constraints
   - Validates: width, height, steps, guidance, aspect-ratio, safety-tolerance, output-format

2. **Code Refactoring** (cli.js:161-243)
   - Extracted parameter building into focused helper functions
   - Reduced `generateImage()` function complexity
   - Improved maintainability and testability
   - Consistent use of Winston logger (no console.log)

3. **Testing Infrastructure**
   - Migrated from single test file to Vitest framework
   - 43 tests across 3 test suites (api, config, utils)
   - 100% test pass rate
   - Coverage tracking with configurable thresholds (70%)
   - Watch mode, UI mode, and coverage reports

4. **Documentation Updates**
   - Fixed references from `main.js` to `cli.js`
   - Updated README.md with testing commands
   - Expanded CLAUDE.md with development guidelines
   - Added JSDoc to all helper functions

### Validation Rules
- **Width/Height**: 256-1440, must be multiple of 32 (FLUX dev/pro)
- **Steps**: 1-50 (FLUX dev)
- **Guidance**: 1.5-5 (FLUX dev)
- **Safety Tolerance**: 0-6 (all models)
- **Aspect Ratio**: 21:9, 16:9, 4:3, 1:1, 3:4, 9:16, 9:21 (FLUX Ultra)
- **Image Prompt Strength**: 0-1 (FLUX Ultra)
- **Output Format**: jpeg, png (all models)

## Notes for Claude Code

- This is a **single standalone package**, not a multi-service repository
- The main entry point is `cli.js` (CLI) and `api.js` (programmatic)
- Follow existing patterns when adding features
- Always test with `--dry-run` first
- Use Vitest for new tests: `npm run test:watch`
- Keep user-facing docs in README.md, developer docs here
- Security: Never expose API keys, always sanitize user input
- Run `npm test` before committing changes
- The "MIT License with Extra Silliness" is intentional humor in LICENSE file
