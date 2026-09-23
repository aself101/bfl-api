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

Two more things the live battery (`LIVE-BATTERY-2026-09-21.md`) taught the
polling path: tasks are served from a *regional* host named only in the submit
response's `polling_url` (the global host 404s), and a poll can answer HTTP 422
with a body that is itself a task result. `getResult` handles both — it explains
the 404 and returns the 422 body as the result — rather than leaving the caller
with a status code.

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

2.x, not 1.8.0. `generateFlux2Pro` no longer accepts `prompt_upsampling`;
Kontext no longer requires `input_image`; generation methods return
`SubmitResult` rather than `TaskResult`; `MODEL_CONSTRAINTS` gained `fields`;
CLI file extensions changed for png-default models. Each is small; together
they are a contract change.

## 10. Releases are manual

semantic-release and its CI job were removed with 2.0. `version` is bumped by
hand, `CHANGELOG.md` is hand-written in Keep a Changelog form, and `npm publish`
runs from a checkout that passed `npm run verify`. CI (`.github/workflows/ci.yml`)
verifies every push and PR but publishes nothing.

**Why:** semantic-release derived the version and changelog from commit
subjects, which meant the 1.x changelog reads as a list of commit titles and a
contract change of this size would have needed a `BREAKING CHANGE:` footer to be
versioned correctly. A hand-written entry says what changed for a consumer.

## 11. Native fetch, no HTTP client dependency

axios is gone; `src/http.ts` wraps native `fetch`. That drops the only runtime
dependency with a real subtree (2.4 MB, 8 transitive packages) and leaves
`commander`, `dotenv` and `winston`.

**The cost is that axios was doing four things implicitly, and each had to be
rebuilt explicitly** — this module exists because a naive port silently loses
all four:

1. **Non-2xx throws.** fetch *resolves* on 4xx/5xx. Left unhandled, an error
   page is a successful response: `downloadMedia` writes it to disk as the
   media file and `urlToBase64` base64s it and posts it to the API. Silent
   corruption, no exception anywhere.
2. **Size caps are enforced while streaming.** fetch has no `maxContentLength`,
   and `arrayBuffer()` buffers the whole body before you can measure it — so a
   post-hoc length check is not a cap. The body is read chunk-by-chunk and
   cancelled the moment it crosses the ceiling. (`for await` locks the stream;
   the cancel has to go through the reader.)
3. **Redirects are followed by hand.** fetch offers `follow` (cap 20,
   unobservable) or `manual`. We follow manually to keep a budget of 5 and to
   re-validate each hop — see #12.
4. **Errors are typed, not stringly matched.** undici reports transport
   failures as `TypeError: fetch failed` with the real code on `.cause.code`,
   under its own vocabulary (`UND_ERR_SOCKET`, not `ECONNRESET`), and nests it
   inside an `AggregateError` when several addresses were tried.

Timeouts are **idle** timeouts (the clock resets on each chunk), matching the
socket-level behaviour Node gave axios. A total deadline would kill large but
healthy video downloads. The polling GET, which carried no timeout at all
before, now has one.

**Breaks if:** BFL starts returning a redirect on a generation endpoint with a
body that matters, or Node changes undici's error codes. The codes live in one
set (`RETRYABLE_NETWORK_CODES`) for that reason.

## 12. Redirects are re-validated, not followed blind

`validateImageUrl` checks the URL it is given. axios then followed up to five
redirects without re-checking any of them, so a URL that passed validation
could `302` to an internal address and the body came back anyway. Demonstrated
before the migration: a local server redirecting to a loopback "metadata"
service returned its content through `axios.get(url, { maxRedirects: 5 })` —
including an https → http downgrade, which the http-only check should have
refused.

`http.ts` follows redirects manually and calls `validateHop` on each target
before following it; `utils.ts` passes `validateImageUrl` as that hook. The
same check that guards the first URL now guards every hop.

Two related fixes landed with it:

- `urlToBase64` validates its own argument. It is an exported function, so it
  could be called directly, and that path did no SSRF validation at all — only
  `imageToBase64` validated before delegating. The test that claimed to cover
  this (`should reject HTTP URLs`) passed for an unrelated reason: with no mock
  configured, `response.data` was `undefined` and threw.
- DNS rebinding was left open at 2.0.1: `validateImageUrl` resolved and
  checked, then the client resolved again independently — a TOCTOU window.
  Closing it needs a pinned-IP dispatcher, which means taking `undici` as an
  explicit dependency, and 2.0.1 declined that as undoing the point of #11.
  **Reversed in 2.0.2** (#15), for the reason #11 itself gives: what made axios
  worth removing was its subtree (2.4 MB, 8 transitive packages). undici has no
  dependencies, is 1.65 MB, and is the engine global fetch already runs on.

**2.0.2 also closed the three check gaps** stability-ai-api's DECISIONS #10
found in this same code: only the first DNS answer was checked (`lookup(host)`;
a name with one public and one private record passed); IPv6 ranges were matched
as literals (`/^fd00:/` passed `fd12:3456::1` and the rest of `fc00::/7`;
`/^fe80:/` missed the rest of `fe80::/10`); and only the dotted IPv4-mapped form
was recognised, while Node's URL parser rewrites `[::ffff:127.0.0.1]` to
`[::ffff:7f00:1]`, so the hex form of loopback passed. The two packages' SSRF
code is now the same again; a fix to one should be carried to the other.

The pre-release security review of 2.0.2 then found two more gaps in that shared
code, fixed in both packages together: the 6to4 (`2002::/16`) and Teredo
(`2001::/32`) tunnel forms carry an IPv4 and are now judged by it (stability
DECISIONS #10, item 6), and deprecated site-local `fec0::/10` is blocked.

## 13. Retry classification is by type, never by message

The old polling loop decided retriability with `err.message.includes(...)`.
Three things were wrong with it, and the migration forced all three into view:

- `'ECONNRESET'` and `'ETIMEDOUT'` **never matched anything**. axios puts the
  code on `.code` and the message reads `socket hang up` / `timeout of 30000ms
  exceeded`. Network errors were documented as retryable and were not retried.
- `'502'`/`'503'` matched only because axios's raw `Request failed with status
  code 503` happened to reach the matcher through a rethrow. Under fetch that
  text does not exist.
- `'moderated'` was matched against a message thrown fifteen lines above it in
  the same function. Rewording either silently broke the no-retry guarantee.

Now: terminal task failures throw `BflTaskError` and are rejected on `instanceof`;
transient means `BflHttpError` with status 502/503, a `BflNetworkError` whose
code is in the retryable set, or `BflTimeoutError`. Message text carries no
control flow. This restores the network-retry behaviour the README always
claimed, which is a behaviour change from what 1.x actually did.

## 14. The release is 2.0.1, because 2.0.0 is unusable

`bfl-api@2.0.0` was published on 2022-12-06 — long before the current 1.x line
began in November 2025 — and later unpublished. npm tombstones unpublished
versions permanently: the registry refuses `PUT` for that exact string forever,
with `Cannot publish over previously published version "2.0.0"`.

**The trap is that the tombstone is invisible from the read side.** It is absent
from the packument's `versions` map, so `npm view bfl-api versions` does not list
it and `npm view bfl-api@2.0.0` returns a plain `E404`. Both readings say the
version is free. The only place it surfaces is the packument's `time` map, which
still holds a `2.0.0` entry that `versions` does not:

```bash
curl -s https://registry.npmjs.org/bfl-api | python3 -c "
import json,sys; d=json.load(sys.stdin)
live=set(d['versions']); times=set(d['time'])-{'created','modified'}
print('tombstoned:', sorted(times-live))"
```

That set difference is the check worth running before picking any version number
for a package with an unpublish in its history. A pre-publish audit that only
consults `versions` will clear a version the registry will then reject.

## 15. `undici` is a dependency, pinned to major 7

Ported with the rebinding guard from stability-ai-api 1.0.1 (its DECISIONS #23),
reversing the 2.0.1 call recorded in #12. Media downloads go through an undici
`Agent` whose `connect.lookup` (`createGuardedLookup`) resolves every address and
refuses if any is blocked, so the addresses checked are the addresses the socket
gets. `validateImageUrl` still runs first: undici connects to IP literals without
a lookup, and the early check gives the readable refusal. API calls keep the
default dispatcher.

It stays on **major 7**, for a measured reason: on both Node 22.23 (bundled undici
6.28) and Node 24.14 (bundled 7.24), global `fetch` rejects an undici **8** `Agent`
with `UND_ERR_INVALID_ARG` on every request — the happy path included — while an
undici 7 `Agent` works on both (checked 2026-09-22). A bump to 8 would break every
download.

Global `fetch` is kept rather than moving downloads to undici's own `fetch`,
because `test/helpers/http-mock.ts` stubs the global; moving off it would exempt
downloads from the whole mocked suite. The `@types/node` / npm-undici type seam is
bridged at one commented site in `request()` rather than by pinning undici to
whatever `undici-types` version `@types/node` carries.

**Guarded by** `dispatcher: connect-time SSRF guard` in `test/http.test.ts`: real
global fetch, real `Agent`, local server. A resolver answering public then loopback
reaches the server without the guard and is refused with it; with undici 8
installed all four tests fail (checked). Revisit when Node's bundled undici reaches 8.
