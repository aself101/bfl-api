# Black Forest Labs Image Generation Service

A Node.js wrapper for the [Black Forest Labs API](https://api.bfl.ml/) that provides easy access to FLUX and Kontext image generation models. Generate stunning AI images with professional quality through a simple command-line interface.

This service follows the data-collection architecture pattern with organized data storage, automatic polling, retry logic, comprehensive logging, and CLI orchestration.

## Table of Contents

- [Overview](#overview)
- [Models](#models)
- [Authentication Setup](#authentication-setup)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [CLI Usage](#cli-usage)
- [API Methods](#api-methods)
- [Examples](#examples)
- [Data Organization](#data-organization)
- [Troubleshooting](#troubleshooting)

## Overview

The Black Forest Labs API provides access to state-of-the-art image generation models. This Node.js service implements:

- **5 Generation Models** - FLUX.1 [dev], FLUX 1.1 [pro], FLUX Ultra, Kontext Pro, Kontext Max
- **Parameter Validation** - Pre-flight validation catches invalid parameters before API calls
- **API Key Authentication** - Simple API key authentication
- **Auto-polling with Spinner** - Automatic result polling with animated progress indicator
- **Batch Processing** - Generate multiple images sequentially from multiple prompts
- **Retry Logic** - Exponential backoff for transient errors
- **Image Input Support** - Convert local files or URLs to base64 automatically
- **Organized Storage** - Structured directories with timestamped files and metadata
- **CLI Orchestration** - Command-line tool for easy batch generation
- **Comprehensive Testing** - 43 tests with Vitest for reliability

## Models

### FLUX.1 [dev]
Full control text-to-image generation with adjustable steps and guidance.

**Best for:** Experimentation, fine-tuning parameters, development
**Parameters:** width, height, steps (1-50), guidance (1.5-5)

### FLUX 1.1 [pro]
Professional quality generation with Redux image prompting.

**Best for:** Production use, high-quality images, image-to-image with Redux
**Parameters:** width, height, image_prompt (optional)

### FLUX 1.1 [pro] Ultra
Maximum quality with aspect ratio control and raw mode.

**Best for:** Cinematic outputs, specific aspect ratios, natural/raw aesthetics
**Parameters:** aspect_ratio (21:9 to 9:21), raw mode, image remixing

### Kontext Pro
Multi-reference image editing with context preservation.

**Best for:** Image editing, multi-reference composition, context-aware modifications
**Parameters:** input_image (required), up to 3 additional reference images

### Kontext Max
Maximum quality multi-reference image editing.

**Best for:** High-end image editing, professional retouching
**Parameters:** input_image (required), up to 3 additional reference images

## Authentication Setup

### 1. Get Your API Key

1. Visit [https://api.bfl.ml/](https://api.bfl.ml/)
2. Create an account or sign in
3. Generate your API key from the dashboard
4. Copy your API key

### 2. Configure Your API Key

You can provide your API key in multiple ways (listed in priority order):

#### Option A: CLI Flag (Highest Priority)
Pass the API key directly when running commands:

```bash
bfl --api-key YOUR_API_KEY --flux-dev --prompt "a cat"
```

This is useful for one-off commands or testing.

#### Option B: Environment Variable
Set the `BFL_API_KEY` environment variable in your shell:

```bash
# Add to your ~/.bashrc, ~/.zshrc, or equivalent
export BFL_API_KEY=your_actual_api_key_here

# Or use it for a single command
BFL_API_KEY=your_key bfl --flux-dev --prompt "a cat"
```

This is ideal for CI/CD pipelines and server environments.

#### Option C: Local .env File (Project-Specific)
Create a `.env` file in your project directory:

```bash
# In your project directory
echo "BFL_API_KEY=your_actual_api_key_here" > .env
```

This is best for project-specific configurations and when working on multiple projects.

#### Option D: Global Config (For Global npm Installs)
Create a global config file at `~/.bfl/.env`:

```bash
# Create config directory
mkdir -p ~/.bfl

# Add your API key
echo "BFL_API_KEY=your_actual_api_key_here" > ~/.bfl/.env
```

This is perfect for global npm installations (`npm install -g bfl-api`) where you want the API key available everywhere.

**Security Note:** Never commit `.env` files or expose your API key publicly. The `.env` file is automatically ignored by git.

## Installation

### Option 1: Install from npm (Coming Soon)

```bash
# Install globally for CLI usage
npm install -g bfl-api

# Or install locally in your project
npm install bfl-api
```

### Option 2: Install from source

```bash
# Clone the repository
git clone https://github.com/aself101/bfl-api.git
cd bfl-api

# Install dependencies
npm install
```

Dependencies:
- `axios` - HTTP client for API calls
- `commander` - CLI argument parsing
- `dotenv` - Environment variable management
- `winston` - Logging framework

## Quick Start

### Using the CLI

The CLI command depends on how you installed the package:

**If installed globally** (`npm install -g bfl-api`):
```bash
bfl --examples                    # Show 15+ usage examples
bfl --flux-dev --prompt "a cat"   # Generate with FLUX.1 [dev]
bfl --credits                     # Check account credits
```

**If installed locally** in a project:
```bash
npx bfl --examples                    # Show 15+ usage examples
npx bfl --flux-dev --prompt "a cat"   # Generate with FLUX.1 [dev]
npx bfl --credits                     # Check account credits
```

**If working from source** (cloned repository):
```bash
npm run bfl:examples              # Show 15+ usage examples
npm run bfl -- --flux-dev --prompt "a cat"   # Generate
npm run bfl:credits               # Check credits
```

### Example Commands

```bash
# Show examples (15+ usage examples)
bfl --examples

# Generate with FLUX.1 [dev]
bfl --flux-dev --prompt "a serene mountain landscape"

# Generate with FLUX 1.1 [pro] Ultra
bfl --flux-ultra --prompt "cinematic sunset" --aspect-ratio "21:9" --raw

# Edit image with Kontext Pro
bfl --kontext-pro --prompt "make it winter" --input-image ./photo.jpg

# Batch generation
bfl --flux-dev \
  --prompt "a cat" \
  --prompt "a dog" \
  --prompt "a bird"

# Check credits
bfl --credits
```

**Note:** Examples below use `bfl` directly (global install). If using local install, prefix with `npx`: `npx bfl --flux-dev ...`

### Using the API Class Directly

```javascript
// If installed via npm
import { BflAPI } from 'bfl-api';

// If running from source
import { BflAPI } from './api.js';

// Initialize the API
const api = new BflAPI();

// Generate with FLUX.1 [dev]
const task = await api.generateFluxDev({
  prompt: 'a beautiful sunset',
  width: 1024,
  height: 768,
  steps: 28,
  guidance: 3
});

// Wait for result
const result = await api.waitForResult(task.id);
console.log('Image URL:', result.result.sample);
```

## CLI Usage

### Basic Command Structure

```bash
# Global install
bfl [model] [options]

# Local install (use npx)
npx bfl [model] [options]

# From source (development)
npm run bfl -- [model] [options]
```

### Model Selection (Required)

Choose one model:

```bash
--flux-dev         # FLUX.1 [dev] - Full control
--flux-pro         # FLUX 1.1 [pro] - Professional quality
--flux-ultra       # FLUX 1.1 [pro] Ultra - Maximum quality
--kontext-pro      # Kontext Pro - Image editing
--kontext-max      # Kontext Max - Premium editing
```

### Common Options

```bash
--prompt <text>               # Prompt (can specify multiple for batch)
--seed <number>               # Random seed for reproducibility
--safety-tolerance <0-6>      # Content moderation level (default: 2)
--output-format <jpeg|png>    # Output format (default: jpeg)
--timeout <seconds>           # Max wait time (default: 300)
--output-dir <path>           # Custom output directory
--log-level <level>           # DEBUG, INFO, WARNING, ERROR
--dry-run                     # Preview without generating
```

**Note**: All parameters are validated before making API calls. Invalid values (e.g., width not divisible by 32, steps > 50) will produce clear error messages, saving API credits.

### FLUX.1 [dev] Specific

```bash
--width <number>              # 256-1440, multiple of 32 (default: 1024)
--height <number>             # 256-1440, multiple of 32 (default: 768)
--steps <number>              # 1-50 (default: 28)
--guidance <number>           # 1.5-5 (default: 3)
--prompt-upsampling           # Enable AI prompt enhancement
```

### FLUX 1.1 [pro] Specific

```bash
--width <number>              # 256-1440, multiple of 32
--height <number>             # 256-1440, multiple of 32
--image-prompt <path>         # Input image for Redux (file or URL)
--prompt-upsampling           # Enable AI prompt enhancement
```

### FLUX Ultra Specific

```bash
--aspect-ratio <ratio>        # e.g., 16:9, 21:9, 1:1 (default: 16:9)
--raw                         # Enable raw/natural mode
--image-prompt <path>         # Input image for remixing (file or URL)
--image-prompt-strength <0-1> # Remix strength (default: 0.1)
```

### Kontext Models Specific

```bash
--input-image <path>          # Primary input (required, file or URL)
--input-image-2 <path>        # Additional reference (optional)
--input-image-3 <path>        # Additional reference (optional)
--input-image-4 <path>        # Additional reference (optional)
```

### Utility Commands

```bash
--examples                    # Show 15+ usage examples with tips
--credits                     # Check account credits balance
--get-result <task_id>        # Poll specific task ID
```

## API Methods

### Core Generation Methods

#### `generateFluxDev(params)`

Generate image using FLUX.1 [dev].

```javascript
const task = await api.generateFluxDev({
  prompt: 'a beautiful landscape',
  width: 1024,
  height: 768,
  steps: 28,
  guidance: 3,
  seed: 42,
  output_format: 'png'
});
```

#### `generateFluxPro(params)`

Generate image using FLUX 1.1 [pro].

```javascript
const task = await api.generateFluxPro({
  prompt: 'professional portrait',
  width: 1024,
  height: 1024,
  image_prompt: 'base64_or_url',  // Optional Redux
  seed: 42
});
```

#### `generateFluxProUltra(params)`

Generate image using FLUX 1.1 [pro] Ultra.

```javascript
const task = await api.generateFluxProUltra({
  prompt: 'cinematic landscape',
  aspect_ratio: '21:9',
  raw: true,
  image_prompt: 'base64_or_url',  // Optional remix
  image_prompt_strength: 0.3
});
```

#### `generateKontextPro(params)`

Edit image using Kontext Pro.

```javascript
const task = await api.generateKontextPro({
  prompt: 'make it look like winter',
  input_image: 'base64_or_url',      // Required
  input_image_2: 'base64_or_url'     // Optional
});
```

#### `generateKontextMax(params)`

Edit image using Kontext Max.

```javascript
const task = await api.generateKontextMax({
  prompt: 'enhance colors and details',
  input_image: 'base64_or_url',      // Required
  input_image_2: 'base64_or_url'     // Optional
});
```

### Utility Methods

#### `getResult(taskId)`

Poll task once for current status.

```javascript
const result = await api.getResult('abc123');
if (result.status === 'Ready') {
  console.log('Image:', result.result.sample);
}
```

#### `waitForResult(taskId, options)`

Auto-poll until complete with spinner and retry logic.

```javascript
const result = await api.waitForResult('abc123', {
  timeout: 300,      // 5 minutes
  pollInterval: 2,   // 2 seconds
  maxRetries: 3,     // retry on transient errors
  showSpinner: true  // animated spinner
});
```

#### `getUserCredits()`

Check account credits balance.

```javascript
const credits = await api.getUserCredits();
console.log('Credits:', credits.credits);
```

## Examples

**Note:** Examples use `bfl` command (global install). For local install, use `npx bfl` instead.

### Example 1: Basic Text-to-Image

```bash
bfl --flux-dev \
  --prompt "a serene mountain landscape at sunset" \
  --width 1024 \
  --height 768 \
  --steps 28 \
  --guidance 3
```

### Example 2: High-Quality Cinematic Output

```bash
bfl --flux-ultra \
  --prompt "cinematic wide shot of a futuristic city" \
  --aspect-ratio "21:9" \
  --raw
```

### Example 3: Image Editing with Kontext

```bash
bfl --kontext-pro \
  --prompt "transform into a watercolor painting" \
  --input-image ./photos/landscape.jpg
```

### Example 4: Batch Generation

```bash
bfl --flux-dev \
  --prompt "a red apple" \
  --prompt "a green pear" \
  --prompt "a yellow banana" \
  --seed 42
```

### Example 5: Redux Image-to-Image

```bash
bfl --flux-pro \
  --prompt "same style but at night" \
  --image-prompt ./reference.jpg \
  --width 1024 \
  --height 1024
```

### Example 6: Using API Class in Code

```javascript
// If installed via npm
import { BflAPI } from 'bfl-api';
import { imageToBase64 } from 'bfl-api/utils';

// If running from source
import { BflAPI } from './api.js';
import { imageToBase64 } from './utils.js';

const api = new BflAPI();

// Convert local image to base64
const inputImage = await imageToBase64('./photo.jpg');

// Edit with Kontext Pro
const task = await api.generateKontextPro({
  prompt: 'make it look like a vintage photograph',
  input_image: inputImage
});

// Wait for result with auto-polling
const result = await api.waitForResult(task.id, {
  timeout: 300,
  showSpinner: true
});

console.log('Generated image:', result.result.sample);
```

## Data Organization

Generated images and metadata are organized by model:

```
datasets/
└── bfl/
    ├── flux-dev/
    │   ├── 2025-01-13_14-30-22_mountain_landscape.jpg
    │   ├── 2025-01-13_14-30-22_mountain_landscape_metadata.json
    │   └── ...
    ├── flux-pro/
    │   └── ...
    ├── flux-ultra/
    │   └── ...
    ├── kontext-pro/
    │   └── ...
    └── kontext-max/
        └── ...
```

**Metadata Format:**

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

## Error Handling

The service includes comprehensive error handling with retry logic:

### Automatic Retries

Transient errors (network, 502, 503) are automatically retried with exponential backoff:
- Retry 1: 2 seconds
- Retry 2: 4 seconds
- Retry 3: 8 seconds

### Non-Retriable Errors

- **Content Moderation**: Prompt flagged by safety filters
- **Authentication (401)**: Invalid API key
- **Validation (422)**: Invalid parameters
- **Rate Limit (429)**: Too many requests

### Polling with Spinner

The CLI shows an animated spinner during generation:

```
⠋ Generating... Pending (12s elapsed, ~288s remaining)
```

On completion:

```
✓ Generation complete! (45.2s)
```

## Troubleshooting

### API Key Not Found

```
Error: BFL_API_KEY not found in environment variables
```

**Solution:** Create `.env` file with your API key:
```bash
BFL_API_KEY=your_api_key_here
```

### Content Moderated

```
Error: Content was moderated. Please revise your prompt.
```

**Solution:** Your prompt was flagged by safety filters. Try:
- Revising your prompt to be more appropriate
- Lowering `--safety-tolerance` (0-6, lower is stricter)

### Authentication Failed

```
Error: Authentication failed. Please check your API key.
```

**Solution:**
1. Verify your API key is correct in `.env`
2. Check your account is active at https://api.bfl.ml/
3. Generate a new API key if needed

### Timeout

```
Error: Timeout after 300 seconds
```

**Solution:**
- Increase timeout: `--timeout 600`
- Complex generations may take longer
- Check API status at https://status.bfl.ml/

### Module Not Found

```
Error: Cannot find module 'axios'
```

**Solution:** Install dependencies:
```bash
cd bfl-api
npm install
```

## Development Scripts

**Note:** These npm scripts are only available when working from the source repository (cloned from GitHub). They are not available after installing via npm.

If you're using the installed package, use `bfl` (global) or `npx bfl` (local) instead.

### For Source Development
```bash
npm run bfl              # Run CLI
npm run bfl:help         # Show help
npm run bfl:examples     # Show 15+ usage examples
npm run bfl:credits      # Check credits
npm run bfl:dev          # Use FLUX.1 [dev]
npm run bfl:pro          # Use FLUX 1.1 [pro]
npm run bfl:ultra        # Use FLUX Ultra
npm run bfl:kontext-pro  # Use Kontext Pro
npm run bfl:kontext-max  # Use Kontext Max
```

Pass additional flags with `--`:

```bash
npm run bfl:dev -- --prompt "a cat" --width 512 --height 512
```

### Testing Commands
```bash
npm test                 # Run all tests with Vitest
npm run test:watch       # Watch mode for development
npm run test:ui          # Interactive UI in browser
npm run test:coverage    # Generate coverage report
```

## Rate Limits

BFL API rate limits vary by account tier. The service automatically:
- Polls every 2 seconds (configurable)
- Retries with exponential backoff on 429 errors
- Handles transient errors gracefully

## Additional Resources

- [BFL API Documentation](https://docs.bfl.ml/)
- [BFL Website](https://blackforestlabs.ai/)
- [FLUX Models Overview](https://blackforestlabs.ai/flux-models/)
- [API Status Page](https://status.bfl.ml/)

## License

This project is licensed under the MIT License (with Extra Silliness) - see the [LICENSE](../LICENSE) file for details.

By using this software, you agree to generate at least one image of a cat wearing sunglasses (optional but encouraged).

---

**Note:** This service implements image generation endpoints. Fine-tuning endpoints can be added as needed following the same patterns established in the API class.
