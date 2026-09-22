# docs/

What lives here, and which files are ours.

| File | Origin | What it is |
|---|---|---|
| `DECISIONS.md` | ours | The design decisions behind 2.0, with the reasoning and what breaks if the reasoning stops holding. Start here. |
| `LIVE-BATTERY-2026-09-21.md` | ours | Record of two full live runs against the production API — every endpoint, with cost, latency, and the defects each run surfaced. |
| `openapi-snapshot-2026-09-20.json` | BFL | Snapshot of `https://api.bfl.ai/openapi.json` at the date 2.0 was built against. `scripts/check-spec-drift.ts --snapshot` uses it as the offline baseline. |
| `flux-2-klein-4b.md`, `flux-2-klein-9b.md`, `flux-2-max-img.md`, `flux-3-video.md`, `flux-3-video-edit.md`, `flux-3-video-upscale.md`, `flux-deblur.md`, `flux-erase.md`, `flux-outpaint.md`, `flux-virtual-try-on.md` | BFL | Vendor reference pages for the endpoints that were new in 2.0, snapshotted as received. **Not maintained by us and not authoritative.** |

## The vendor pages are reference, not truth

Where a vendor page and the OpenAPI spec disagree, the spec wins — and they did
disagree in four places, which is why this is worth stating. `DECISIONS.md` #7
lists them: the video `aspect_ratio` enum, whether `flux-3-video` accepts
`seed`, whether video-edit lives in the main spec, and whether the spelled-out
mode aliases are accepted.

The live check on the parameter surface is `npm run check:spec`, which compares
`MODELS` / `MODEL_FIELDS` / `MODEL_CONSTRAINTS` against the live spec on every
CI run. `npm run check:spec:control` proves that check can fail.
