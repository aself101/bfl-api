> ## Documentation Index
> Fetch the complete documentation index at: https://docs.bfl.ml/llms.txt
> Use this file to discover all available pages before exploring further.

# Generate a video with FLUX 3

> Submits a video generation task to FLUX 3 via the harness. The mode is explicit: t2v (`text-to-video`), i2v (`image-continuation`, keyframes), v2v (`video-continuation`, start_video), or draft_enhance (`draft-enhance`, full-quality render of a prior draft's `draft_cache`); the spelled-out aliases are accepted anywhere the short key is.

export const ModeDeepLinks = ({modes}) => {
  useEffect(() => {
    if (!Array.isArray(modes) || !modes.length) return undefined;
    const press = el => {
      const opts = {
        bubbles: true,
        cancelable: true
      };
      el.dispatchEvent(new PointerEvent("pointerdown", {
        ...opts,
        pointerId: 1
      }));
      el.dispatchEvent(new MouseEvent("mousedown", opts));
      el.dispatchEvent(new PointerEvent("pointerup", {
        ...opts,
        pointerId: 1
      }));
      el.dispatchEvent(new MouseEvent("mouseup", opts));
      el.dispatchEvent(new MouseEvent("click", opts));
    };
    const modeTabs = () => {
      const wanted = new Set(modes.map(m => m.tab));
      const lists = Array.from(document.querySelectorAll('[role="tablist"]')).filter(list => Array.from(list.querySelectorAll('[role="tab"]')).filter(b => wanted.has(b.textContent.trim())).length >= 2);
      return lists.flatMap(list => Array.from(list.querySelectorAll('[role="tab"]')));
    };
    const exampleTrigger = () => {
      const names = new Set(modes.map(m => m.example));
      return Array.from(document.querySelectorAll("button")).find(b => b.getAttribute("aria-haspopup") && names.has(b.textContent.trim()));
    };
    const HIDE_MENU_STYLE_ID = "mode-deep-links-hide-menu";
    const hideMenus = () => {
      if (document.getElementById(HIDE_MENU_STYLE_ID)) return;
      const style = document.createElement("style");
      style.id = HIDE_MENU_STYLE_ID;
      style.textContent = '[data-radix-popper-content-wrapper], [role="menu"], [role="listbox"] { visibility: hidden !important; }';
      document.head.appendChild(style);
    };
    const unhideMenus = () => {
      document.getElementById(HIDE_MENU_STYLE_ID)?.remove();
    };
    const selectExample = (name, attempt = 0) => {
      const trigger = exampleTrigger();
      if (!trigger) {
        if (attempt < 6) window.setTimeout(() => selectExample(name, attempt + 1), 300);
        return;
      }
      if (trigger.textContent.trim() === name) return;
      hideMenus();
      press(trigger);
      window.setTimeout(() => {
        const items = Array.from(document.querySelectorAll('[role="menuitem"], [role="option"], [role="menuitemradio"]'));
        const item = items.find(i => i.textContent.trim() === name);
        if (item) {
          press(item);
          window.setTimeout(() => {
            unhideMenus();
            const now = exampleTrigger();
            if (now && now.textContent.trim() !== name && attempt < 6) {
              selectExample(name, attempt + 1);
            }
          }, 250);
        } else {
          document.dispatchEvent(new KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true
          }));
          unhideMenus();
          if (attempt < 6) {
            window.setTimeout(() => selectExample(name, attempt + 1), 300);
          }
        }
      }, 150);
    };
    const selectMode = (mode, {writeHash = true, switchTab = true} = {}) => {
      if (switchTab) {
        const tab = modeTabs().find(b => b.textContent.trim() === mode.tab);
        if (tab && tab.getAttribute("aria-selected") !== "true") press(tab);
      }
      if (writeHash) {
        window.history.replaceState(null, "", "#" + mode.slug);
      }
      selectExample(mode.example);
    };
    const onClick = event => {
      const tab = event.target.closest('[role="tab"]');
      if (!tab) return;
      const mode = modes.find(m => m.tab === tab.textContent.trim());
      if (mode) selectMode(mode, {
        switchTab: false
      });
    };
    document.addEventListener("click", onClick, true);
    const applyHash = () => {
      const slug = window.location.hash.replace(/^#/, "");
      const mode = modes.find(m => m.slug === slug);
      if (mode) selectMode(mode, {
        writeHash: false
      });
    };
    window.addEventListener("hashchange", applyHash);
    const settle = window.setTimeout(applyHash, 600);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("hashchange", applyHash);
      window.clearTimeout(settle);
    };
  }, []);
  return null;
};

<ModeDeepLinks
  modes={[
{ slug: "text-to-video", tab: "Text to Video", example: "text-to-video" },
{ slug: "image-to-video", tab: "Image to Video", example: "image-to-video" },
{ slug: "video-continuation", tab: "Video Continuation", example: "video-continuation" },
{ slug: "draft-enhance", tab: "Draft Enhance", example: "draft-enhance" },
]}
/>


## OpenAPI

````yaml https://api.bfl.ai/openapi.json POST /v1/flux-3-video
openapi: 3.1.0
info:
  title: BFL API
  description: Authorize with an API key from your user profile.
  version: 0.0.1
servers:
  - url: https://api.bfl.ai
    description: BFL API
security: []
tags:
  - name: Models
    description: >-
      Generation task endpoints. These endpoints allow you to submit generation
      tasks.
  - name: Utility
    description: >-
      These utility endpoints allow you to check the results of submitted tasks
      and to manage your finetunes.
paths:
  /v1/flux-3-video:
    post:
      tags:
        - Models
      summary: Generate a video with FLUX 3.
      description: >-
        Submits a video generation task to FLUX 3 via the harness. The mode is
        explicit: t2v (`text-to-video`), i2v (`image-continuation`, keyframes),
        v2v (`video-continuation`, start_video), or draft_enhance
        (`draft-enhance`, full-quality render of a prior draft's `draft_cache`);
        the spelled-out aliases are accepted anywhere the short key is.
      operationId: flux_3_video_v1_flux_3_video_post
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Flux3VideoInputsBody'
      responses:
        '200':
          description: Successful Response
          content:
            application/json:
              schema:
                anyOf:
                  - $ref: '#/components/schemas/AsyncResponse'
                  - $ref: '#/components/schemas/AsyncWebhookResponse'
                title: Response Flux 3 Video V1 Flux 3 Video Post
        '422':
          description: Validation Error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HTTPValidationError'
      security:
        - APIKeyHeader: []
components:
  schemas:
    Flux3VideoInputsBody:
      oneOf:
        - $ref: '#/components/schemas/Flux3VideoT2VInputs'
        - $ref: '#/components/schemas/Flux3VideoI2VInputs'
        - $ref: '#/components/schemas/Flux3VideoV2VInputs'
        - $ref: '#/components/schemas/Flux3VideoDraftEnhanceInputs'
      title: Flux3VideoInputsBody
      description: |-
        Route body wrapper: FastAPI drops the union's discriminator when the
        bare union is the top-level body param, so 422s enumerate every mode
        class instead of the one the client sent. The RootModel keeps
        discrimination inside pydantic; routes unwrap `.root`.
      discriminator:
        propertyName: mode
        mapping:
          draft_enhance:
            $ref: '#/components/schemas/Flux3VideoDraftEnhanceInputs'
          i2v:
            $ref: '#/components/schemas/Flux3VideoI2VInputs'
          t2v:
            $ref: '#/components/schemas/Flux3VideoT2VInputs'
          v2v:
            $ref: '#/components/schemas/Flux3VideoV2VInputs'
    AsyncResponse:
      properties:
        id:
          type: string
          title: Id
        polling_url:
          type: string
          title: Polling Url
        cost:
          anyOf:
            - type: number
            - type: 'null'
          title: Cost
          description: Cost in credits for this request
        input_mp:
          anyOf:
            - type: number
            - type: 'null'
          title: Input Mp
          description: Input megapixels (2 decimal places)
        output_mp:
          anyOf:
            - type: number
            - type: 'null'
          title: Output Mp
          description: Output megapixels (2 decimal places)
      type: object
      required:
        - id
        - polling_url
      title: AsyncResponse
    AsyncWebhookResponse:
      properties:
        id:
          type: string
          title: Id
        status:
          type: string
          title: Status
        webhook_url:
          type: string
          title: Webhook Url
        cost:
          anyOf:
            - type: number
            - type: 'null'
          title: Cost
          description: Cost in credits for this request
        input_mp:
          anyOf:
            - type: number
            - type: 'null'
          title: Input Mp
          description: Input megapixels (2 decimal places)
        output_mp:
          anyOf:
            - type: number
            - type: 'null'
          title: Output Mp
          description: Output megapixels (2 decimal places)
      type: object
      required:
        - id
        - status
        - webhook_url
      title: AsyncWebhookResponse
    HTTPValidationError:
      properties:
        detail:
          items:
            $ref: '#/components/schemas/ValidationError'
          type: array
          title: Detail
      type: object
      title: HTTPValidationError
    Flux3VideoT2VInputs:
      properties:
        user:
          anyOf:
            - type: string
              maxLength: 256
              minLength: 1
            - type: 'null'
          title: User
          description: Opaque identifier for the end user supplied by the calling platform.
        prompt:
          type: string
          title: Prompt
          description: Free-form prompt describing the video.
        aspect_ratio:
          anyOf:
            - type: string
              enum:
                - '21:9'
                - '2:1'
                - '16:9'
                - '4:3'
                - '1:1'
                - '3:4'
                - '9:16'
            - type: string
              const: auto
          title: Aspect Ratio
          description: >-
            Output aspect ratio. `auto` lets the harness choose from the prompt
            and any references.
          default: auto
        duration:
          anyOf:
            - type: integer
              maximum: 20
              minimum: 5
            - type: string
              const: auto
          title: Duration
          description: >-
            Video duration in seconds (any whole second from 5 to 20), or `auto`
            to fit the content.
          default: auto
        resolution:
          type: string
          enum:
            - hd
            - fhd
            - qhd
            - uhd
          title: Resolution
          description: >-
            Video resolution class: `hd`, or `fhd`/`qhd`/`uhd` for a
            higher-resolution result finished by the video upsampler. Exact
            dimensions vary with the aspect ratio.
          default: hd
        version:
          type: string
          const: latest
          title: Version
          description: >-
            Endpoint version. `latest` (default) serves the current release;
            dated pinnable release tags are added here as they are published.
          default: latest
        generate_audio:
          type: boolean
          title: Generate Audio
          description: Generate synchronized audio alongside the video.
          default: true
        safety_tolerance:
          type: integer
          maximum: 4
          minimum: 0
          title: Safety Tolerance
          description: >-
            Tolerance level for input and output harm moderation. Between 0 and
            4, with 0 the strictest. Sexual content is limited to level 3 and
            hate content to level 2 regardless of the requested tolerance.
            Contextual safety signals can tighten the requested level.
          default: 2
        draft:
          type: boolean
          title: Draft
          description: >-
            Draft mode: generate a fast preview and return a `draft_cache`
            download URL in the result. Download that bundle and pass it back
            later to render the full-quality version of the same generation.
          default: false
        mode:
          type: string
          const: t2v
          title: Mode
      additionalProperties: false
      type: object
      required:
        - prompt
        - mode
      title: Text to Video
    Flux3VideoI2VInputs:
      properties:
        user:
          anyOf:
            - type: string
              maxLength: 256
              minLength: 1
            - type: 'null'
          title: User
          description: Opaque identifier for the end user supplied by the calling platform.
        prompt:
          type: string
          title: Prompt
          description: Free-form prompt describing the video.
        aspect_ratio:
          anyOf:
            - type: string
              enum:
                - '21:9'
                - '2:1'
                - '16:9'
                - '4:3'
                - '1:1'
                - '3:4'
                - '9:16'
            - type: string
              const: auto
          title: Aspect Ratio
          description: >-
            Output aspect ratio. `auto` lets the harness choose from the prompt
            and any references.
          default: auto
        duration:
          anyOf:
            - type: integer
              maximum: 20
              minimum: 5
            - type: string
              const: auto
          title: Duration
          description: >-
            Video duration in seconds (any whole second from 5 to 20), or `auto`
            to fit the content.
          default: auto
        resolution:
          type: string
          enum:
            - hd
            - fhd
            - qhd
            - uhd
          title: Resolution
          description: >-
            Video resolution class: `hd`, or `fhd`/`qhd`/`uhd` for a
            higher-resolution result finished by the video upsampler. Exact
            dimensions vary with the aspect ratio.
          default: hd
        version:
          type: string
          const: latest
          title: Version
          description: >-
            Endpoint version. `latest` (default) serves the current release;
            dated pinnable release tags are added here as they are published.
          default: latest
        generate_audio:
          type: boolean
          title: Generate Audio
          description: Generate synchronized audio alongside the video.
          default: true
        safety_tolerance:
          type: integer
          maximum: 4
          minimum: 0
          title: Safety Tolerance
          description: >-
            Tolerance level for input and output harm moderation. Between 0 and
            4, with 0 the strictest. Sexual content is limited to level 3 and
            hate content to level 2 regardless of the requested tolerance.
            Contextual safety signals can tighten the requested level.
          default: 2
        draft:
          type: boolean
          title: Draft
          description: >-
            Draft mode: generate a fast preview and return a `draft_cache`
            download URL in the result. Download that bundle and pass it back
            later to render the full-quality version of the same generation.
          default: false
        mode:
          type: string
          const: i2v
          title: Mode
        keyframes:
          anyOf:
            - type: string
            - prefixItems:
                - type: number
                - type: string
              type: array
              maxItems: 2
              minItems: 2
            - items:
                type: string
              type: array
            - items:
                prefixItems:
                  - type: number
                  - type: string
                type: array
                maxItems: 2
                minItems: 2
              type: array
          title: Keyframes
          description: >-
            Your images become frames of the video; each is an http(s) URL or
            base64, one to ten total. Plain images: one starts the video, two
            start and end it, with more the first starts it, the last ends it,
            and the rest fall evenly in between (3 or more need a set
            `duration`). To control the timing yourself, send `[seconds, image]`
            pairs in time order, e.g. `[[0, "..."], [3.5, "..."]]`: each image
            becomes the frame at that second, and with `duration: "auto"` the
            video runs to the last pair's second, rounded up (20s max).
      additionalProperties: false
      type: object
      required:
        - prompt
        - mode
        - keyframes
      title: Image to Video
      description: |-
        Image continuation: your images become frames of the video. One image
        starts the video; two start and end it; with more, the first starts it,
        the last ends it, and the rest fall evenly in between. To control the
        timing yourself, send `[seconds, image]` pairs: each image becomes the
        frame at that second.
    Flux3VideoV2VInputs:
      properties:
        user:
          anyOf:
            - type: string
              maxLength: 256
              minLength: 1
            - type: 'null'
          title: User
          description: Opaque identifier for the end user supplied by the calling platform.
        prompt:
          type: string
          title: Prompt
          description: Free-form prompt describing the video.
        aspect_ratio:
          anyOf:
            - type: string
              enum:
                - '21:9'
                - '2:1'
                - '16:9'
                - '4:3'
                - '1:1'
                - '3:4'
                - '9:16'
            - type: string
              const: auto
          title: Aspect Ratio
          description: >-
            Output aspect ratio. `auto` lets the harness choose from the prompt
            and any references.
          default: auto
        duration:
          anyOf:
            - type: integer
              maximum: 15
              minimum: 5
            - type: string
              const: auto
          title: Duration
          description: >-
            Video duration in seconds (any whole second from 5 to 15), or `auto`
            to fit the content.
          default: auto
        resolution:
          type: string
          enum:
            - hd
            - fhd
            - qhd
            - uhd
          title: Resolution
          description: >-
            Video resolution class: `hd`, or `fhd`/`qhd`/`uhd` for a
            higher-resolution result finished by the video upsampler. Exact
            dimensions vary with the aspect ratio.
          default: hd
        version:
          type: string
          const: latest
          title: Version
          description: >-
            Endpoint version. `latest` (default) serves the current release;
            dated pinnable release tags are added here as they are published.
          default: latest
        generate_audio:
          type: boolean
          title: Generate Audio
          description: Generate synchronized audio alongside the video.
          default: true
        safety_tolerance:
          type: integer
          maximum: 4
          minimum: 0
          title: Safety Tolerance
          description: >-
            Tolerance level for input and output harm moderation. Between 0 and
            4, with 0 the strictest. Sexual content is limited to level 3 and
            hate content to level 2 regardless of the requested tolerance.
            Contextual safety signals can tighten the requested level.
          default: 2
        draft:
          type: boolean
          title: Draft
          description: >-
            Draft mode: generate a fast preview and return a `draft_cache`
            download URL in the result. Download that bundle and pass it back
            later to render the full-quality version of the same generation.
          default: false
        mode:
          type: string
          const: v2v
          title: Mode
        start_video:
          type: string
          title: Start Video
          description: >-
            The video to continue, an http(s) URL or base64 mp4; the generated
            clip carries on from its final frames.
      additionalProperties: false
      type: object
      required:
        - prompt
        - mode
        - start_video
      title: Video Continuation
      description: |-
        Video continuation: the generated clip carries on from your video's
        final frames.
    Flux3VideoDraftEnhanceInputs:
      properties:
        user:
          anyOf:
            - type: string
              maxLength: 256
              minLength: 1
            - type: 'null'
          title: User
          description: Opaque identifier for the end user supplied by the calling platform.
        mode:
          type: string
          const: draft_enhance
          title: Mode
        draft_cache:
          type: string
          title: Draft Cache
          description: >-
            Encrypted draft-cache bundle from a prior `draft` generation.
            Primary form: the base64-encoded `.bin` file downloaded from the
            prior result's `draft_cache` URL. An http(s) URL is also accepted
            for replays within the download URL's expiry window. The harness is
            skipped and the original FLUX call is reproduced at full quality;
            the original inputs are embedded in the bundle.
        resolution:
          type: string
          enum:
            - hd
            - fhd
            - qhd
            - uhd
          title: Resolution
          description: >-
            Video resolution class of the enhanced result: `fhd` (default),
            `qhd`, and `uhd` finish the reproduced generation with the video
            upsampler at that canvas, `hd` returns it without that pass. The
            reproduced generation is identical whichever is chosen; only the
            finishing pass differs.
          default: fhd
        safety_tolerance:
          type: integer
          maximum: 4
          minimum: 0
          title: Safety Tolerance
          description: >-
            Tolerance level for replay input and output harm moderation. Between
            0 and 4, with 0 the strictest. Sexual content is limited to level 3
            and hate content to level 2 regardless of the requested tolerance.
          default: 2
      additionalProperties: false
      type: object
      required:
        - mode
        - draft_cache
      title: Draft Enhance
      description: |-
        Full-quality render of a prior `draft` generation. The bundle pins the
        generation itself -- the original mode, prompt, seed, and conditioning
        media -- so `resolution` is the only output choice left to the caller.
    ValidationError:
      properties:
        loc:
          items:
            anyOf:
              - type: string
              - type: integer
          type: array
          title: Location
        msg:
          type: string
          title: Message
        type:
          type: string
          title: Error Type
      type: object
      required:
        - loc
        - msg
        - type
      title: ValidationError
  securitySchemes:
    APIKeyHeader:
      type: apiKey
      in: header
      name: x-key

````