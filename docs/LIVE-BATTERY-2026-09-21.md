# Live battery — 2026-09-21 (axios) and 2026-09-22 (native fetch)

Every endpoint the wrapper exposes, run through the built CLI (`dist/cli.js`) against the
production API on 2026-09-21, from commit `cc4bc6e` plus the two fixes this run produced.
Later stages consumed earlier outputs: the klein-4b bicycle and Kontext lighthouse fed
fill / expand / deblur / erase / outpaint / i2v; two klein-4b renders (person, jacket) fed
try-on; the t2v fox clip fed v2v / edit / upscale; the t2v draft fed draft_enhance. The
runner and per-run logs lived in the session scratchpad and are not committed.

Credits: 857.0 before → 198.6 after. Seven video renders account for ~640 of that.

| run | model | result | cost (submit echo) | wall s | notes |
|---|---|---|---|---|---|
| flux-dev | flux-dev | OK | — | 4.9 |  |
| flux-pro | flux-pro | OK | — | 2.4 |  |
| flux-ultra | flux-ultra | OK | — | 13.8 |  |
| kontext-pro | kontext-pro | OK | — | 8.6 |  |
| kontext-max | kontext-max | OK | — | 6.5 |  |
| flux-2-pro | flux-2-pro | OK | 6 | 13.8 |  |
| flux-2-flex | flux-2-flex | OK | 10 | 6.7 |  |
| flux-2-max | flux-2-max | OK | 16 | 36.0 |  |
| flux-2-klein-9b | flux-2-klein-9b | OK | 1.5 | 2.4 |  |
| flux-2-klein-4b | flux-2-klein-4b | OK | 1.4 | 2.6 |  |
| flux-2-klein-4b-2 | flux-2-klein-4b | OK | 1.4 | 2.7 |  |
| flux-fill | flux-pro-fill | OK | — | 4.4 |  |
| flux-expand | flux-pro-expand | OK | — | 6.5 |  |
| flux-deblur | flux-deblur | OK | 3 | 2.3 |  |
| flux-erase | flux-erase | OK | 3 | 2.3 | mask covered the bicycle centre; region regenerated (seat, logo, chainguard changed) |
| flux-outpaint | flux-outpaint | OK | 4.5 | 4.9 |  |
| flux-outpaint-high | flux-outpaint | OK | 20 | 34.4 | `reference_offset_x` −128 + `auto_crop`; seam visible at x≈896 as expected |
| flux-vto | flux-vto | OK | 4.75 | 4.4 | person from image 1 wearing the jacket from image 2 — verified visually |
| flux-ultra-finetuned-x | flux-ultra-finetuned | FAIL | — | — | bogus finetune_id — server 400 as expected (no finetunes on account) |
| flux-fill-finetuned-x | flux-pro-fill-finetuned | FAIL | — | — | bogus finetune_id — server 400 as expected |
| finetune-details-x | (finetune_details) | FAIL | — | — | bogus id — server 404 as expected |
| video-t2v-draft | flux-3-video t2v | OK | — | 33.9 | settled cost 30; result also carries `draft_cache` and `draft_caches` |
| video-t2v | flux-3-video t2v | OK | — | 39.8 | settled cost 85; served from `api.isr.bfl.ai` |
| video-draft-enhance | flux-3-video draft_enhance | OK | — | 62.7 |  |
| video-i2v | flux-3-video i2v | OK | — | 67.1 |  |
| video-v2v | flux-3-video v2v | FAIL | — | — | draft (`--draft --no-audio`) clip as `start_video` → poll answered 422 `Invalid or corrupted image input`; see finding 2 |
| video-edit | flux-video-edit | OK | — | 41.9 |  |
| video-upscale | flux-video-upscale | OK | — | 52.7 |  |
| video-v2v-fox | flux-3-video v2v | OK | — | 83.6 | retry with the full-render fox clip |

FLUX.1-era endpoints (dev, pro, ultra, fill, expand, kontext) and flux-3-video do not echo
`cost` on submit; the settled cost is on the `get_result` body once Ready.

## Findings

1. **Tasks are regional.** Submits through `api.bfl.ai` were served from `api.eu2`, `api.us2`
   and `api.isr`. `get_result` on the global host returns 404 for such a task. Fixed in
   `cc4bc6e`: `getResult` explains the 404, the CLI persists `polling_url` in every metadata
   file and takes `--polling-url`.
2. **A poll can answer HTTP 422 with a task body.** v2v with the draft clip: the polling URL
   returned 422 whose body was `{status: "Error", details: {error: "Invalid or corrupted
   image input"}}`. The wrapper had thrown the bare axios error and lost `details.error`.
   Fixed in `03dcdc6`: `getResult` returns such a body as the result, so `waitForResult`
   reports `Generation failed: Invalid or corrupted image input`. Whether the rejection was
   because the clip was a *draft* or because it had *no audio* is not established — the
   full-render clip (audio on) was accepted as `start_video`.
3. `result` on a Ready video carries `prompt`, `seed`, `start_time`, and for drafts both
   `draft_cache` and `draft_caches`; none of these are in the doc pages. `TaskResult.result`
   is open-keyed for this reason.
4. Nothing in the constraint table was contradicted: every range the wrapper enforces was
   accepted at its edges where exercised (dilate 12, guidance 40/50 on fill/expand, flex
   guidance 4 / steps 30, upscale 1.5 / creativity 0, video safety 2, klein 768×1024).

---

## Re-run on native fetch — 2026-09-22

The same battery after the axios → fetch migration (commit `49df7d6`), on Node 22.
Purpose: confirm the hand-rolled HTTP layer behaves identically against the real API.

| run | result | cost | wall s | notes |
|---|---|---|---|---|
| flux-dev | OK | — | 4.6 |  |
| flux-pro | OK | — | 2.4 |  |
| flux-ultra | OK | — | 10.8 |  |
| kontext-pro | OK | — | 6.6 |  |
| kontext-max | OK | — | 8.6 |  |
| flux-2-pro | OK | 6 | 11.6 |  |
| flux-2-flex | OK | 10 | 8.8 |  |
| flux-2-max | OK | 16 | 40.6 |  |
| flux-2-klein-9b | OK | 1.5 | 4.9 |  |
| flux-2-klein-4b | OK | 1.4 | 2.3 |  |
| flux-fill | OK | — | 4.6 |  |
| flux-expand | OK | — | 22.7 |  |
| flux-deblur | OK | 3 | 2.4 |  |
| flux-erase | OK | 3 | 2.3 |  |
| flux-outpaint | OK | 4.5 | 2.3 |  |
| flux-outpaint-high | OK | 20 | 32.2 |  |
| flux-vto | OK | 4.75 | 7.1 |  |
| flux-ultra-finetuned-x | FAIL | — | — | bogus finetune_id — identical 400 text to the axios run |
| flux-fill-finetuned-x | FAIL | — | — | bogus finetune_id — identical 400 text |
| finetune-details-x | FAIL | — | — | bogus id — identical 404 text |
| video-t2v-draft | OK | — | 34.1 | draft cache downloaded automatically to <name>.draft.bin |
| video-t2v | OK | — | 69.2 |  |
| video-draft-enhance | OK | — | 46.9 |  |
| video-i2v | OK | — | 101.9 | two plain keyframes spread across the duration |
| video-v2v | FAIL then **OK** | 205 (settled) | 154.6 | 402 back-to-back; succeeded when run alone — see Throttling below |
| video-edit | FAIL then **OK** | 15 (settled) | 32.9 | same |
| video-upscale | FAIL then **OK** | 69 (settled) | 52.7 | same |

**21 of 21 endpoints verified live on fetch.**

### Throttling presents as `402 Insufficient credits`

Three video endpoints (`v2v`, `video-edit`, `video-upscale`) were refused with
`402 {"detail":"Insufficient credits"}` at submit, immediately, when run back-to-back right after
a 101 s i2v render — with **1013.4 credits on the account**. Reproduced with a raw `urllib` call
with the wrapper entirely out of the loop, so it is the API's own response, not the client's.

Re-run **one at a time, each waiting for its predecessor to settle**, all three succeeded on the
first attempt and drew 15 / 69 / 205 credits (1013.4 → 998.4 → 929.4 → 724.4). The balance was
never the constraint.

So on the FLUX 3 video endpoints, a 402 is not reliably a balance signal — it also covers
submitting while prior video work is still settling. Treat it as back-pressure: wait and retry
rather than topping up. The wrapper does **not** retry 402 (it is not in the transient set), which
is the right default — a genuine balance failure should not be retried in a loop — but callers
batching video work should space their submissions.

**Payload equivalence.** Comparing the `parameters` block of every metadata file across the two
runs (base64 inputs hashed): **16 of 17 models produced byte-identical request payloads**. The
single difference is `flux-2-klein-4b`, where the two runs were deliberately given different
prompts and dimensions — the first run used it to generate the try-on person fixture.

**Error-path equivalence.** The three expected rejections returned identical message text under
both clients (`HTTP 400: Finetune not found or not ready`, `HTTP 404: Finetune not found or
access denied`), confirming the new `BflHttpError` mapping reproduces what axios surfaced.

**Timings** are within normal API variance in both directions (e.g. `flux-expand` 6.5s → 22.7s,
`flux-outpaint` 4.9s → 2.3s); nothing suggests a systematic change from the client swap.
