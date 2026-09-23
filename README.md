# BFL (FLUX) Image & Video Generation — Node.js wrapper and CLI

[![npm version](https://img.shields.io/npm/v/bfl-api.svg)](https://www.npmjs.com/package/bfl-api)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/node/v/bfl-api)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-418%20passing-brightgreen)](test/)
[![Coverage](https://img.shields.io/badge/coverage-91.5%25-brightgreen)](test/)

A TypeScript/Node.js wrapper for the [Black Forest Labs API](https://docs.bfl.ml/) covering every
generation endpoint BFL publishes: **FLUX.1**, **FLUX.2** (pro / flex / max / klein), **Kontext**,
the **FLUX Tools** image endpoints (deblur, erase, outpaint, virtual try-on), and **FLUX 3 video**
(text-to-video, image- and video-continuation, edit, upscale). Typed API class plus a batch CLI
with auto-polling, retries, and organised output.

The wrapper is checked against BFL's live OpenAPI document on every CI run
([`scripts/check-spec-drift.ts`](scripts/check-spec-drift.ts)), so a parameter the API renames or
adds fails the build instead of silently going unsupported.

> **Upgrading from 1.x?** See [Upgrading to 2.0](#upgrading-to-20) — there are four contract changes.

## Quick Demo

[![asciicast](https://asciinema.org/a/755878.svg)](https://asciinema.org/a/755878)

**[📺 Watch 3-minute CLI demo](https://asciinema.org/a/755878)** — batch processing, auto-retry, and organised output.

## Quick Start

```bash
npm install -g bfl-api
export BFL_API_KEY=your_key            # from https://dashboard.bfl.ai/

bfl --flux-2-pro --prompt "a lighthouse in a storm" --width 1024 --height 1024
bfl --flux-erase --image ./photo.jpg --mask ./remove.png
bfl --flux-3-video --video-mode t2v --prompt "a fox runs through autumn woods" --duration 8
bfl --examples                          # one worked example per model
```

```typescript
import { BflAPI } from 'bfl-api';

const api = new BflAPI(); // reads BFL_API_KEY

const task = await api.generateFlux2Pro({ prompt: 'a lighthouse in a storm', width: 1024, height: 1024 });
const result = await api.waitForResult(task.id, { pollingUrl: task.polling_url });
console.log(result.result?.sample); // signed URL, expires in ~1 hour

const clip = await api.generateFlux3Video({ mode: 't2v', prompt: 'a fox runs through autumn woods', duration: 8 });
const video = await api.waitForResult(clip.id, { pollingUrl: clip.polling_url, timeout: 900 });
```

## Table of Contents

- [Models](#models)
- [Authentication](#authentication)
- [Installation](#installation)
- [CLI](#cli)
- [API](#api)
- [TypeScript](#typescript)
- [Output and metadata](#output-and-metadata)
- [Polling, errors and retries](#polling-errors-and-retries)
- [Security](#security)
- [Spec drift check](#spec-drift-check)
- [Upgrading to 2.0](#upgrading-to-20)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

## Models

Twenty-one endpoints. Parameter ranges below are what the wrapper validates before spending
credits; they mirror `https://api.bfl.ai/openapi.json` (snapshot in [`docs/`](docs/)) plus the
documented product limits the spec does not encode.

### FLUX.1 family

| CLI flag | Method | Required | Notable parameters |
|---|---|---|---|
| `--flux-dev` | `generateFluxDev` | `prompt` | `width`/`height` 256–1440 ÷32, `steps` 1–50, `guidance` 1.5–5, `image_prompt` |
| `--flux-pro` | `generateFluxPro` | `prompt` | `width`/`height` 256–1440 ÷32, `image_prompt` (Redux) |
| `--flux-ultra` | `generateFluxProUltra` | `prompt` | `aspect_ratio` 21:9…9:21, `raw`, `image_prompt` + `image_prompt_strength` 0–1 |
| `--flux-ultra-finetuned` | `generateFluxProUltraFinetuned` | `finetune_id` | as Ultra minus `raw`, plus `finetune_strength` 0–2 |
| `--flux-fill` | `generateFluxProFill` | `image`, `prompt` | `mask`, `steps` 15–50, `guidance` 1.5–100 |
| `--flux-fill-finetuned` | `generateFluxProFillFinetuned` | `finetune_id`, `image` | as Fill plus `finetune_strength` 0–2 |
| `--flux-expand` | `generateFluxProExpand` | `image` | `top`/`bottom`/`left`/`right` 0–2048, `steps`, `guidance` |
| `--kontext-pro` | `generateKontextPro` | `prompt` | `input_image`…`_4` (optional — text-only works), `aspect_ratio` |
| `--kontext-max` | `generateKontextMax` | `prompt` | same as Kontext Pro |

FLUX.1 `safety_tolerance` is 0–6. Kontext's server-default `output_format` is **png**.

### FLUX.2 family

| CLI flag | Method | Required | Notable parameters |
|---|---|---|---|
| `--flux-2-pro` | `generateFlux2Pro` | `prompt` | `input_image`…`_8`, `width`/`height` ≥64, `disable_pup` |
| `--flux-2-max` | `generateFlux2Max` | `prompt` | same schema as [pro] — highest quality tier |
| `--flux-2-flex` | `generateFlux2Flex` | `prompt` | `input_image`…`_8`, `guidance` 1.5–10, `steps` 1–50, `prompt_upsampling` |
| `--flux-2-klein-4b` | `generateFlux2Klein4b` | `prompt` | `input_image`…`_4`, `width`/`height` ≥64 — fastest tier |
| `--flux-2-klein-9b` | `generateFlux2Klein9b` | `prompt` | same as klein 4B |

FLUX.2 `safety_tolerance` is 0–5. **[pro] and [max] upsample the prompt by default**; pass
`disable_pup: true` (`--disable-pup`) to use your prompt verbatim. [flex] uses `prompt_upsampling`
instead (default true). Dimensions are validated at 64–2048, multiple of 16 — the documented product
limit; the spec states only the minimum.

### FLUX Tools (image)

| CLI flag | Method | Required | Notable parameters |
|---|---|---|---|
| `--flux-deblur` | `deblurImage` | `image` | nothing else — no prompt, no mask |
| `--flux-erase` | `eraseImage` | `image`, `mask` | `dilate_pixels` 0–25 (default 10); white mask pixels are removed |
| `--flux-outpaint` | `outpaintImage` | `input_image`, `width`, `height` | `reference_offset_x`/`_y` (px, may be negative; omit to centre), `auto_crop`, `mode` high\|fast, `prompt`, `disable_pup` |
| `--flux-vto` | `virtualTryOn` | `prompt`, `person`, `garment` | — |

Tools `safety_tolerance` is 0–5. Deblur, erase and outpaint default `output_format` to **png**.
Outpaint replaces the FLUX.1 "pixels per side" model with a target canvas and a placement offset.

### FLUX 3 (video)

| CLI flag | Method | Required | Notable parameters |
|---|---|---|---|
| `--flux-3-video` | `generateFlux3Video` | `mode`, then per mode | see below |
| `--flux-video-edit` | `editVideo` | `video`, `prompt` (≤4096 chars) | `safety_tolerance` only — duration/resolution/audio come from the source |
| `--flux-video-upscale` | `upscaleVideo` | `input_video` | `upscale_factor` 1.5–3, `creativity` 0\|1, `prompt` |

`generateFlux3Video` is a discriminated union on `mode`:

| `mode` | CLI `--video-mode` | Required | Extra |
|---|---|---|---|
| `t2v` | `t2v` | `prompt` | — |
| `i2v` | `i2v` | `prompt`, `keyframes` | `--keyframe a.jpg b.jpg` spreads plain images across the duration; `--keyframe 0:a.jpg 4.5:b.jpg` pins them to seconds |
| `v2v` | `v2v` | `prompt`, `start_video` | continues from the clip's final frames; `duration` ≤15 here |
| `draft_enhance` | `draft_enhance` | `draft_cache` | full-quality render of a prior `draft: true` result; accepts only `resolution`, `safety_tolerance`, `user`. The CLI saves a draft's bundle as `<name>.draft.bin` next to the video |

Common to t2v/i2v/v2v: `aspect_ratio` (21:9 … 9:21 or `auto`), `duration` 5–20 s or `'auto'`,
`resolution` hd\|fhd\|qhd\|uhd, `generate_audio` (default true), `draft`. Video `safety_tolerance`
is **0–4**. There is no `seed` or `output_format` on any video endpoint; results are always MP4.
The video schemas are strict — an unknown field is a 422 — so the wrapper sends exactly the fields
each mode declares and validates the mode's required input before submitting.

### Every endpoint also accepts

- `user` — opaque end-user id forwarded to BFL (not on `flux-ultra-finetuned`).
- `webhook_url` / `webhook_secret` — receive the result by webhook; the submit response then has no
  `polling_url`. (Not on `flux-3-video`, `flux-video-edit`, `flux-outpaint`.)
- `seed` on image endpoints except outpaint; `output_format` jpeg\|png\|webp on every image endpoint.

## Authentication

Get a key at [dashboard.bfl.ai](https://dashboard.bfl.ai/). The wrapper looks in this order:

1. `--api-key` CLI flag / `new BflAPI({ apiKey })`
2. `BFL_API_KEY` environment variable
3. `.env` in the current directory
4. `~/.bfl/.env` (for global installs)

```bash
mkdir -p ~/.bfl && echo "BFL_API_KEY=your_key" > ~/.bfl/.env
```

## Installation

```bash
npm install -g bfl-api      # CLI: bfl
npm install bfl-api         # library, or npx bfl
```

From source: `git clone https://github.com/aself101/bfl-api && cd bfl-api && npm install && npm run build`.
Requires Node 22+ (native `fetch`, `AbortSignal.timeout`).

## CLI

```text
bfl <model flag> [--prompt "text"...] [inputs] [parameters] [options]
```

One model flag per run. `--prompt` may repeat for batch generation; deblur, erase, outpaint,
upscale and `draft_enhance` run without one.

**Inputs** (file path or HTTP(S) URL; files are validated and base64-encoded, video URLs are passed
through):
`--image`, `--mask`, `--image-prompt`, `--input-image`…`--input-image-8`, `--person`, `--garment`,
`--video`, `--input-video`, `--start-video`, `--keyframe <spec...>`, `--draft-cache`.

**Parameters:** `--width`, `--height`, `--steps`, `--guidance`, `--aspect-ratio`, `--raw`,
`--image-prompt-strength`, `--top/--bottom/--left/--right`, `--finetune-id`, `--finetune-strength`,
`--dilate-pixels`, `--auto-crop`, `--reference-offset-x/-y`, `--outpaint-mode`, `--video-mode`,
`--duration`, `--resolution`, `--no-audio`, `--draft`, `--creativity`, `--upscale-factor`,
`--seed`, `--safety-tolerance`, `--output-format`, `--prompt-upsampling`, `--disable-pup`,
`--user`, `--webhook-url`, `--webhook-secret`.

**Options:** `--output-dir`, `--timeout` (default 300 s image / 900 s video), `--dry-run` (prints the
exact payload with base64 elided), `--log-level`, `--api-key`.

**Utilities:** `--credits`, `--list-finetunes`, `--finetune-details <id>`,
`--delete-finetune <id> --yes`, `--get-result <task id> [--polling-url <url>]`, `--examples`, `--help`.

Ranges are validated before the request is sent (`bfl --flux-2-flex --guidance 11 …` fails locally,
not after a round trip). `bfl --examples` prints one worked command per model.

## API

```typescript
const api = new BflAPI({ apiKey?, baseUrl?, logLevel? });
```

Every `generate*` / tool method returns a `SubmitResult` — `{ id, polling_url, cost?, input_mp?,
output_mp? }` (or `{ id, status, webhook_url }` in webhook mode). Poll with:

```typescript
const result = await api.waitForResult(task.id, {
  pollingUrl: task.polling_url,   // use the URL the API gave you — it is region-specific
  timeout: 300,                   // seconds
  pollInterval: 2,
  maxRetries: 3,
  showSpinner: true,
});
// result.status === 'Ready'; result.result.sample is the media URL
```

`getResult(taskId, pollingUrl?)` polls once. Pass the `polling_url` from the submit response: tasks
are served from a regional host (`api.eu2.bfl.ai`, …) and the global host returns 404 for a task
that lives elsewhere. The CLI writes `polling_url` into each metadata file for this reason. `getUserCredits()`, `getMyFinetunes()`,
`getFinetuneDetails(id)` and `deleteFinetune(id)` cover the account endpoints.

Fields you don't set are not sent, so the server's defaults apply. Only the fields each endpoint's
schema declares are forwarded — see `MODEL_FIELDS` in [`src/config.ts`](src/config.ts).

```typescript
import { imageToBase64 } from 'bfl-api/utils';

// Every image/video field takes base64 or an https URL; imageToBase64 handles
// local files (and validates them) for you.
const image = await imageToBase64('./photo.jpg');
const mask = await imageToBase64('./mask.png');

// Erase with the mask dilated a little further than default
await api.eraseImage({ image, mask, dilate_pixels: 14 });

// Outpaint a 1024×768 photo onto a 2048×768 canvas, photo flush left
await api.outpaintImage({ input_image: image, width: 2048, height: 768, reference_offset_x: 0 });

// Timed keyframes: first image at 0 s, second at 4.5 s, video runs to 5 s
await api.generateFlux3Video({
  mode: 'i2v',
  prompt: 'the scene comes alive',
  keyframes: [[0, image], [4.5, mask]],
});

// Draft → enhance
const draft = await api.generateFlux3Video({ mode: 't2v', prompt: 'a fox in the woods', draft: true });
const done = await api.waitForResult(draft.id, { pollingUrl: draft.polling_url });
// download done.result.draft_cache (a .bin) promptly — the URL expires — then:
await api.generateFlux3Video({ mode: 'draft_enhance', draft_cache: base64OfBin, resolution: 'qhd' });
```

## TypeScript

Everything is typed and exported from the package root:

```typescript
import type {
  // per-schema parameter types
  FluxDevParams, FluxProParams, FluxProUltraParams, FluxProUltraFinetunedParams,
  FluxProFillParams, FluxProFillFinetunedParams, FluxProExpandParams,
  KontextProParams, KontextMaxParams,
  Flux2ProParams, Flux2FlexParams, Flux2KleinParams, Flux2Params /* union, 1.x compat */,
  FluxDeblurParams, FluxEraseParams, FluxOutpaintParams, FluxVtoParams,
  Flux3VideoParams, Flux3VideoT2VParams, Flux3VideoI2VParams, Flux3VideoV2VParams,
  Flux3VideoDraftEnhanceParams, VideoKeyframe, VideoAspectRatio, VideoResolution,
  FluxVideoEditParams, FluxVideoUpscaleParams,
  CommonRequestFields, OutputFormat,
  // responses
  SubmitResult, TaskResult, TaskStatus, CreditsResult, FinetunesResult,
  FinetuneDetailsResult, DeleteFinetuneResult,
  // polling / validation / config
  WaitResultOptions, ValidationResult, Flux3VideoMode,
  BflApiOptions, ModelEndpointKey, ModelInfo, MediaKind, ModelConstraint,
} from 'bfl-api';
import { BflHttpError, BflNetworkError, BflTimeoutError, BflTaskError } from 'bfl-api';
```

### Subpath exports

Two subpaths expose the pieces the client is built from. Both are public and typed.

```typescript
// bfl-api/config — the endpoint registry and pre-flight validation
import {
  MODELS,              // per-model path, label, media kind, default output format
  MODEL_ENDPOINTS,     // model key -> request path
  MODEL_FIELDS,        // exact request fields forwarded per model
  MODEL_CONSTRAINTS,   // ranges/enums enforced before spending credits
  FLUX3_VIDEO_MODE_FIELDS,
  MODEL_KEYS,
  validateModelParams, // (model, params) => { valid, errors }
  getModelInfo,
  getModelConstraints,
  getBflApiKey, validateApiKeyFormat,
  getOutputDir, getPollInterval, getTimeout,
  BASE_URL, US_BASE_URL, DEFAULT_POLL_INTERVAL, DEFAULT_TIMEOUT, MAX_RETRIES,
} from 'bfl-api/config';

// bfl-api/utils — input preparation, downloads, and the shared logger
import {
  imageToBase64,       // local file or URL -> base64, with validation
  videoToBase64,       // local file -> base64; URLs pass through
  fileToBase64, urlToBase64,
  validateImageUrl,    // the SSRF check used on every URL and redirect hop
  createGuardedLookup, // connect-time SSRF guard: a lookup for an undici 7 Agent
  validateImagePath, validateImageFile, validateVideoPath,
  downloadImage, downloadVideo, downloadMedia,
  promptToFilename, generateTimestampedFilename,
  ensureDirectory, writeToFile, readFromFile,
  createSpinner, pause, randomNumber,
  setLogLevel, logger,
  MAX_VIDEO_UPLOAD_BYTES, MAX_DOWNLOAD_BYTES,
} from 'bfl-api/utils';
```

`validateModelParams` is worth knowing about on its own: it is the same
pre-flight check the CLI runs, so you can reject a bad request locally instead
of paying for the round trip.

```typescript
const { valid, errors } = validateModelParams('flux-2-flex', { guidance: 11 });
// valid === false, errors === ['guidance must be between 1.5 and 10 for flux-2-flex']
```

Types are split by *request schema*: `Flux2ProParams` serves both [pro] and [max] because the API
declares one schema for them; [flex] and [klein] have their own. `Flux3VideoParams` is a
discriminated union, so `mode: 'i2v'` makes `keyframes` required at compile time.

## Output and metadata

The CLI saves under `datasets/bfl/<model>/` (or `--output-dir` / `BFL_OUTPUT_DIR`) as
`<timestamp>_<prompt-slug>.<ext>` plus `…_metadata.json`. The extension follows the media kind and
format: `.mp4` for video; otherwise `--output-format`, or the model's server default when omitted
(png for Kontext, deblur, erase, outpaint; jpeg elsewhere).

```json
{
  "task_id": "abc123",
  "polling_url": "https://api.eu2.bfl.ai/v1/get_result?id=abc123",
  "model": "flux-erase",
  "timestamp": "2026-09-20T14:30:22Z",
  "parameters": { "image": "<base64 41208 chars>", "mask": "<base64 3320 chars>", "dilate_pixels": 12 },
  "result": {
    "status": "Ready",
    "media_url": "https://…",
    "output_path": "datasets/bfl/flux-erase/2026-09-20_14-30-22_flux-erase.png",
    "cost": 0.05
  }
}
```

## Polling, errors and retries

`get_result` reports `Pending → Reasoning → Generating → Ready`. `waitForResult` keeps polling
through the first three (showing `progress` when the API reports it) and throws on the terminal
failures: `Error` (message from `details.error`), `Request Moderated`, `Content Moderated`, and
`Task not found` (immediately — it will never change).

Retries are decided by error *type*, never by message text: a `BflHttpError` with status 502/503,
a `BflNetworkError` whose `.code` is retryable (reset, refused, DNS, undici's `UND_ERR_*`), or a
`BflTimeoutError`. Backoff is 2 s / 4 s / 8 s, or exactly the server's `Retry-After` when it sends
one. A settled task failure throws `BflTaskError` and is never retried — retrying a poll returns
the same answer. In `NODE_ENV=production` messages are sanitised to generic text.

```typescript
import { BflHttpError, BflNetworkError, BflTimeoutError, BflTaskError } from 'bfl-api';
```

Result URLs are signed and expire after about an hour — download promptly.

```text
⠋ Generating... Generating 40% (12s elapsed, ~288s remaining)
✓ Generation complete! (45.2s)
```

## Security

- **API key** never appears in logs (redacted to the last four characters) and is sent only to
  `api.bfl.ai` — never to result download URLs.
- **SSRF protection** on every URL input and download: loopback, private, link-local, metadata,
  carrier-grade NAT (`100.64/10`), benchmarking (`198.18/15`), `192.0.0/24` and multicast/reserved
  (`224/3`) are blocked, and the whole of IPv6 `fe80::/10`, `fc00::/7` and `ff00::/8`. An IPv6
  address embedding an IPv4 one — mapped (dotted or hex), translated, NAT64, IPv4-compatible — is
  judged by that IPv4. **Every** DNS answer is checked, not the first.
- **File validation** by magic bytes (PNG/JPEG/WebP/GIF for images, ISO BMFF `ftyp` for video) —
  the extension is not trusted.
- **Size limits enforced while streaming**, not after buffering: 50 MB video upload (the API's
  ceiling), 50 MB image download, 500 MB video download. A body that crosses the ceiling is
  cancelled mid-flight rather than measured once it is already in memory.
- **Redirects are bounded (5) and re-validated.** Every hop is put back through the SSRF check
  before it is followed, so a validated URL cannot `302` to an internal address or downgrade to
  http. Timeouts are idle-based (30 s API, 60 s image, 120 s video), so a slow-but-progressing
  download is not killed; HTTPS is enforced for `baseUrl`.
- **DNS rebinding is closed (2.0.2).** Downloads connect through an undici dispatcher whose lookup
  checks the addresses the socket is actually given, so a name that resolves public at validation
  and private at connect time is refused before any connection is made. See `docs/DECISIONS.md`
  #12 and #15.
- **Destructive CLI actions** (`--delete-finetune`) require `--yes`.

## Spec drift check

```bash
npm run check:spec            # compare MODELS / MODEL_FIELDS / MODEL_CONSTRAINTS to the live OpenAPI spec
npm run check:spec:control    # prove the check can fail (seeds five drifts, requires each caught)
npm run check:spec:snapshot   # offline, against docs/openapi-snapshot-<date>.json
```

For every model it requires the request schema's property set to equal the fields the wrapper
forwards, every stated range and enum to match the constraint table, and the `output_format`
default to match the registry. CI runs `--control` then the live check before the tests. Where the
wrapper is deliberately stricter than the spec it reports INFO, not FAIL. Rationale and history in
[`docs/DECISIONS.md`](docs/DECISIONS.md).

## Upgrading to 2.0

Four contract changes, all driven by the API having moved:

1. **`generateFlux2Pro` no longer takes `prompt_upsampling`.** The API replaced it with
   `disable_pup` (upsampling is on by default; set `disable_pup: true` for a verbatim prompt).
   `Flux2Params` is now a union — use `Flux2ProParams` / `Flux2FlexParams` / `Flux2KleinParams`.
2. **Kontext no longer requires `input_image`** — text-only generation works — and now forwards
   `aspect_ratio` and `prompt_upsampling`.
3. **Generation methods return `SubmitResult`** (`{ id, polling_url, cost, … }`) instead of
   `TaskResult`; `TaskResult.status` is the full `TaskStatus` union and gained `progress`,
   `details`, `preview`, `cost`. `Request Moderated` is now terminal.
4. **CLI file extensions follow the server default** when `--output-format` is omitted: Kontext
   output is now saved as `.png` (it always was PNG data). Video saves as `.mp4`.

Also new: `webp` is accepted everywhere; `user`/`webhook_url`/`webhook_secret` are forwarded;
`MODEL_ENDPOINTS` is derived from a richer `MODELS` registry; `MODEL_CONSTRAINTS` entries may carry
a `fields` map for 2.0-era parameters.

## Development

```bash
npm run build                 # tsc → dist/
npm test                      # 418 tests (vitest)
npm run test:coverage         # 90.8% lines
npm run verify                # build + spec control + live spec check + tests — what CI runs
npm run bfl -- --examples     # run the CLI from source
```

Publishing is manual: bump `version` in `package.json`, add a CHANGELOG entry, `npm run verify`, `npm publish`, then tag `v<version>`.

## Troubleshooting

- **`BFL_API_KEY not found`** — see [Authentication](#authentication); `~/.bfl/.env` is the
  global-install path.
- **`Invalid parameters: …`** (422) with a video endpoint — the video schemas reject unknown
  fields. Use `--dry-run` to see the exact payload; only the fields listed for that mode are valid.
- **`402 Insufficient credits` on a video endpoint with credits to spare** — observed as
  back-pressure, not a balance signal: three video submissions fired back-to-back after a long
  render were all refused with 402 at ~1013 credits, then each succeeded on the first attempt when
  run one at a time (drawing 15 / 69 / 205). Space out video submissions rather than topping up.
  This is not retried automatically, since a real balance failure should not loop.
- **`Generation failed: Invalid or corrupted image input` on v2v** — a draft render was rejected as
  `start_video` in testing; a full render was accepted. Use a non-draft clip.
- **`Content was moderated` / `Request was moderated`** — revise the prompt or inputs; these are not
  retried. Video tolerates less (`safety_tolerance` ≤4) than images.
- **`Task not found` / 404 from `--get-result`** — tasks are regional; pass the `polling_url` from
  the submit response or the metadata file (`--polling-url`). Otherwise the id is wrong or the task
  expired; results are retained ~1 hour.
- **Timeout** — video renders can take several minutes; the CLI defaults to 900 s for video, or
  pass `--timeout`.
- **Kontext output saved as `.jpg` in 1.x** — it was PNG data with the wrong extension; 2.0
  names it `.png`.
- **`check:spec` fails in CI** — BFL changed the API. The message names the model and field; update
  `MODEL_FIELDS` / `MODEL_CONSTRAINTS` / the params type, and re-snapshot with `--save`.

## Additional Resources

- [BFL API Documentation](https://docs.bfl.ml/) · [OpenAPI](https://api.bfl.ai/openapi.json)
- [BFL Dashboard](https://dashboard.bfl.ai/) · [Status Page](https://status.bfl.ml/)
- [FLUX Models Overview](https://blackforestlabs.ai/flux-models/)

## Related Packages

Part of the img-gen ecosystem:
[`ideogram-api`](https://github.com/aself101/ideogram-api) ·
[`stability-ai-api`](https://github.com/aself101/stability-ai-api) ·
[`google-genai-api`](https://github.com/aself101/google-genai-api) ·
[`openai-api`](https://github.com/aself101/openai-api)

---

**Disclaimer:** This project is an independent community wrapper and is not affiliated with Black Forest Labs.

## License

MIT (with Extra Silliness) — see [LICENSE](LICENSE).
