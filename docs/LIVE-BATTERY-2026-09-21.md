# Live battery — 2026-09-21

Every endpoint the wrapper exposes, run through the built CLI () against
the production API on 2026-09-21, from commit  plus the two fixes this run
produced. Later stages consumed earlier outputs: the klein-4b bicycle and Kontext
lighthouse fed fill / expand / deblur / erase / outpaint / i2v; two klein-4b renders
(person, jacket) fed try-on; the t2v fox clip fed v2v / edit / upscale; the t2v draft
fed draft_enhance. Runner and per-run logs:  (not committed).

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
| flux-outpaint-high | flux-outpaint | OK | 20 | 34.4 | reference_offset_x −128 + auto_crop; seam visible at x≈896 as expected |
| flux-vto | flux-vto | OK | 4.75 | 4.4 | person from image 1 wearing the jacket from image 2 — verified visually |
| flux-ultra-finetuned-x | flux-ultra-finetuned | FAIL | — | — | bogus finetune_id — server 400 as expected (no finetunes on account) |
| flux-fill-finetuned-x | flux-pro-fill-finetuned | FAIL | — | — | bogus finetune_id — server 400 as expected |
| finetune-details-x | (finetune_details) | FAIL | — | — | bogus id — server 404 as expected |
| video-t2v-draft | flux-3-video t2v | OK | — | 33.9 | settled cost 30; result also carries  and  |
| video-t2v | flux-3-video t2v | OK | — | 39.8 | settled cost 85; served from api.isr.bfl.ai |
| video-draft-enhance | flux-3-video draft_enhance | OK | — | 62.7 |  |
| video-i2v | flux-3-video i2v | OK | — | 67.1 |  |
| video-v2v | flux-3-video v2v | FAIL | — | — | draft (--draft --no-audio) clip as start_video → poll answered 422 ; see finding 2 |
| video-edit | flux-video-edit | OK | — | 41.9 |  |
| video-upscale | flux-video-upscale | OK | — | 52.7 |  |
| video-v2v-fox | flux-3-video v2v | OK | — | 83.6 | retry with the full-render fox clip |

FLUX.1-era endpoints (dev, pro, ultra, fill, expand, kontext) and flux-3-video do not echo
 on submit; the settled cost is on the  body once Ready.

## Findings

1. **Tasks are regional.** Submits through  were served from , 
   and .  on the global host returns 404 for such a task. Fixed in
   :  explains the 404, the CLI persists  in every
   metadata file and takes .
2. **A poll can answer HTTP 422 with a task body.** v2v with the draft clip: the polling
   URL returned 422 whose body was . The wrapper had thrown the bare axios error and lost
   . Fixed:  returns such a body as the result, so
    reports .
   Whether the rejection was because the clip was a *draft* or because it had *no audio*
   is not established — the full-render clip (audio on) was accepted as .
3.  on a Ready video carries , , , and for drafts both
    and ; none of these are in the doc pages. 
   is open-keyed for this reason.
4. Nothing in the constraint table was contradicted: every range the wrapper enforces was
   accepted at its edges where exercised (dilate 12, guidance 40/50 on fill/expand, flex
   guidance 4 / steps 30, upscale 1.5 / creativity 0, video safety 2, klein 768×1024).
