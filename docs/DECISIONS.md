# Design decisions

Decisions that shaped the 2.0 update, with the reasoning and what breaks if the
reasoning stops holding. The OpenAPI document is the source of truth for
*parameters*; this file records the choices the spec does not make for us.

The spec the release was built against is `openapi-snapshot-2026-09-20.json`
(fetched from `https://api.bfl.ai/openapi.json`). The ten Mintlify pages in this
directory are the human-readable reference for the endpoints that were new at
that date; where a page and the spec disagree, the spec wins (see #7).

## 1. Types are split by request schema, not by model

`Flux2ProParams` serves FLUX.2 [pro] *and* [max] because the API declares one
schema (`Flux2Inputs`) for both. `Flux2FlexParams` is separate because
`Flux2FlexInputs` carries `guidance`, `steps` and `prompt_upsampling` that
`Flux2Inputs` does not. `Flux2KleinParams` is separate again (four image slots,
no upsampling control).

**Why:** a params type that is the union of two schemas lets the compiler accept
a field the server will reject. 1.x had one `Flux2Params` for pro and flex, and
that is how `prompt_upsampling` kept being sent to [pro] after the API replaced
it with `disable_pup`.

**Breaks if:** BFL merges or re-splits schemas. The drift check (#6) reports the
field-set change; the fix is to re-split the types the same way.

`Flux2Params` remains exported as the union of the three so 1.x code still
type-checks; new code should name the schema-specific type.

## 2. Send only what the caller set; server defaults apply

Every payload builder copies fields from `MODEL_FIELDS[model]` (config.ts) and
skips `undefined`/`null`. 1.x forced defaults for some fields (FLUX.2
`prompt_upsampling: true`).

**Why:** the server's default is the correct default by definition, and it can
change without a wrapper release. Forcing it client-side also meant the wrapper
was *sending* a field, which is what turns a renamed field into a 422 on a strict
schema.

**Exceptions, kept from 1.x for compatibility:** FLUX.1 [dev]/[pro] still fill
`width`/`height` (and dev `steps`/`guidance`), Ultra fills `aspect_ratio`/`raw`.
These match the server defaults exactly and exist so a caller can read the
values back off the payload. `dilate_pixels: 0`, `creativity: 0`,
`generate_audio: false` and `prompt: ''` are all *sent* — a falsy value is not
an unset one.

`user`, `webhook_url` and `webhook_secret` ride on `CommonRequestFields` and are
included in `MODEL_FIELDS` for every model whose schema declares them. Two do
not: `flux-3-video` and `flux-video-edit` have no webhook fields, and
`flux-ultra-finetuned` has no `user` (all three confirmed against the spec by
the drift check).

## 3. Polling knows the full status vocabulary

`get_result` now reports `Pending → Reasoning → Generating → Ready`, plus the
terminal `Error`, `Request Moderated`, `Content Moderated`, and `Task not found`.
`waitForResult` continues on the first three (surfacing `progress` in the
spinner), returns on `Ready`, and throws on the rest — `Task not found`
immediately, since it will never change. On `Error` the message comes from
`details.error` (the current location) with `result.error` as fallback.

A 503 on the polling URL carrying `Retry-After` waits that long instead of the
exponential backoff. `_makeRequest` throws `BflHttpError` (status + retryAfter)
rather than a bare `Error` so the header survives the rewrap.

**Why:** 1.x treated any unrecognised status as "keep polling", so `Task not
found` spun until the timeout, and `Request Moderated` was treated as in-flight
when the docs list it as terminal.

**Breaks if:** BFL adds a status. Unknown statuses still keep polling (with a
warning) rather than fail, so a new in-flight status degrades gracefully; a new
*terminal* status would spin to timeout until added to `TaskStatus`.

## 4. Video is a media kind, not a special case

`MODELS[key].media` is `'image' | 'video'`. The CLI derives the file extension
(`.mp4` vs `output_format`) and the download ceiling from it. The same registry
carries `defaultOutputFormat` read from the spec, which is how Kontext and the
FLUX Tools image endpoints (server default `png`) stop being saved as `.jpg`.

**Why:** the alternative — `if (model === 'flux-3-video' || …)` in the CLI —
is the shape that goes stale.

## 5. FLUX 3 video is validated per mode before submit

`generateFlux3Video` switches on `mode`, checks the mode's required field
(`keyframes`, `start_video`, `draft_cache`), and sends exactly
`FLUX3_VIDEO_MODE_FIELDS[mode]`. The four mode schemas are
`additionalProperties: false`; `draft_enhance` in particular accepts only five
fields, and a stray `prompt` costs a round trip to learn about.

The spelled-out mode aliases the doc page mentions (`text-to-video` etc.) are
**not** accepted: the schema `const`s are the short keys and the discriminator
mapping lists only those. The wrapper rejects unknown modes client-side.

`seed` is not a FLUX 3 video field. The video-edit page's prose implies it is;
the spec says otherwise, in every mode.

## 6. The spec is checked, not trusted

`scripts/check-spec-drift.ts` fetches the live OpenAPI document and, for every
model, requires the request schema's property set to equal `MODEL_FIELDS`
exactly, every stated range/enum to match `MODEL_CONSTRAINTS`, and the
`output_format` default to match `MODELS`. It runs in CI ahead of the tests,
and `--control` seeds five kinds of drift into a copy of the spec and requires
each to be caught — a check that cannot fail proves nothing.

**Why:** 1.7.1 shipped in December 2025 with `prompt_upsampling` on flux-2-pro,
which the API had already replaced, and with `webp` rejected client-side while
the server accepted it. Nothing in the repo could have noticed. The cost of this
guard is that CI needs network access to `api.bfl.ai`; the snapshot flag
(`--snapshot docs/openapi-snapshot-<date>.json`) is the offline fallback.

Where the wrapper is *stricter* than the spec — the 2048 / multiple-of-16 rule
on FLUX.2 dimensions, the 4096 canvas cap on outpaint, the aspect-ratio lists
for FLUX.1 models where the spec has only a description — the check reports
INFO, not FAIL. These are carried from 1.x and from the doc pages; they are the
documented product limits, and the spec simply does not encode them.

## 7. Where the doc pages and the spec disagreed

Recorded so the next reader does not re-derive them.

| page says | spec says | wrapper does |
|---|---|---|
| video `aspect_ratio` enum has 7 values (no `9:21`) | 8 values incl. `9:21` | 8 + `auto` |
| video-edit "does not accept … seed", implying flux-3-video does | no `seed` on any flux-3-video mode | no `seed` |
| video-edit spec is a separate `openapi/video-edit.json` | present in the main spec as `Flux3VideoVE2VNamedInputs`, with a `user` field the page omits | forwards `user` |
| mode aliases (`text-to-video`) "accepted anywhere" | `const` short keys only | short keys only |

## 8. Scope of the 2.0 endpoint set

Added: every endpoint in the ten doc pages, plus `flux-pro-1.1-ultra-finetuned`
(sibling of the fill finetune the wrapper already had), `GET /v1/finetune_details`
and `POST /v1/delete_finetune` (they complete the finetune story next to
`my_finetunes`; delete requires `--yes` in the CLI).

Deliberately not added: `flux-2-pro-preview` and `flux-2-klein-9b-preview`
("where our latest quality and speed improvements land first … for stable
production use, prefer" the non-preview), and `flux-tools/vto-v1` (superseded by
v2 with an identical request shape). Any of the three is a one-line `MODELS`
entry plus a params type if wanted later.

## 9. Version

2.0.0, not 1.8.0. `generateFlux2Pro` no longer accepts `prompt_upsampling`;
Kontext no longer requires `input_image`; generation methods return
`SubmitResult` rather than `TaskResult`; `MODEL_CONSTRAINTS` gained `fields`;
CLI file extensions changed for png-default models. Each is small; together
they are a contract change.

## 10. Releases are manual

semantic-release and its CI job were removed with 2.0.0. `version` is bumped by
hand, `CHANGELOG.md` is hand-written in Keep a Changelog form, and `npm publish`
runs from a checkout that passed `npm run verify`. CI (`.github/workflows/ci.yml`)
verifies every push and PR but publishes nothing.

**Why:** semantic-release derived the version and changelog from commit
subjects, which meant the 1.x changelog reads as a list of commit titles and a
contract change of this size would have needed a `BREAKING CHANGE:` footer to be
versioned correctly. A hand-written entry says what changed for a consumer.
