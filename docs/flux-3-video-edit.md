> ## Documentation Index
> Fetch the complete documentation index at: https://docs.bfl.ml/llms.txt
> Use this file to discover all available pages before exploring further.

# Edit a video

> Transform a source clip with an edit instruction. The server sets duration, resolution, aspect ratio, and audio from the source; sources larger than 720p are downscaled to 720p. This endpoint does not accept FLUX 3 generation controls such as mode, version, seed, or generate_audio.

Send a source `video` and an edit `prompt` to FLUX Video Edit. This is a
FLUX Tools endpoint, separate from `/v1/flux-3-video`; do not send a `mode`.

## Retrieve the edited clip

The submission returns an `id` and a `polling_url`. Poll that URL while `status`
is `Pending`, `Reasoning`, or `Generating`. Polling does not require an API key.
When `status` is `Ready`, download the video from `result.sample`.
Do not send the API key to the video download URL.

Stop on `Request Moderated`, `Content Moderated`, `Error`, or `Task not found`.
Requests to use the clip as a reference for a new video or to extend it fail
with HTTP 422, `status: "Error"`, and an explanation in `details.error`.
Use [video continuation](/flux_3/flux3_video#video-continuation)
for extension.

A polling HTTP 503 with `Retry-After` means to wait and retry the same URL,
not submit another generation. Download completed results promptly; their
signed URLs expire after about one hour.

## Limits and pricing

Input limits, output behavior and pricing are on the
[FLUX Video Edit page](/flux_tools/flux_video_edit#request-parameters), with a
[quick start](/flux_tools/flux_video_edit#quick-start) that submits and polls.


## OpenAPI

````yaml openapi/video-edit.json POST /v1/flux-tools/video-edit-v1
openapi: 3.1.0
info:
  title: FLUX Video Edit
  version: video-edit-v1
servers:
  - url: https://api.bfl.ai
security: []
paths:
  /v1/flux-tools/video-edit-v1:
    post:
      summary: Edit a video
      description: >-
        Transform a source clip with an edit instruction. The server sets
        duration, resolution, aspect ratio, and audio from the source; sources
        larger than 720p are downscaled to 720p. This endpoint does not accept
        FLUX 3 generation controls such as mode, version, seed, or
        generate_audio.
      operationId: generate_flux_tools_video_edit_v1
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/VideoEditInputs'
            example:
              video: >-
                https://cdn.sanity.io/files/2gpum2i6/production/f1654af36e7694775939b1aa8a2bb0419ff819ea.mp4
              prompt: Remove the orange bucket.
      responses:
        '200':
          description: >-
            Task accepted. Poll the returned polling_url until Ready, then
            download result.sample.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AsyncResponse'
        '422':
          description: >-
            Invalid request, including unknown fields, an empty prompt, or
            safety_tolerance outside 0 to 4.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HTTPValidationError'
      security:
        - APIKeyHeader: []
components:
  schemas:
    VideoEditInputs:
      title: Video Edit
      type: object
      additionalProperties: false
      required:
        - video
        - prompt
      properties:
        video:
          type: string
          description: >-
            The video to edit, as an HTTP(S) URL or a base64-encoded MP4. Up to
            15 seconds and 50 MiB, at least 160 pixels on each side and at least
            17 frames after normalization to 24 fps.
        prompt:
          type: string
          minLength: 1
          maxLength: 4096
          description: >-
            Edit instruction. Surrounding whitespace is removed before
            validation.
        safety_tolerance:
          type: integer
          minimum: 0
          maximum: 4
          default: 2
          description: >-
            Input and output moderation tolerance; 0 is strictest. Sexual
            content is capped at level 3 and hate content at level 2 regardless
            of this value.
    AsyncResponse:
      type: object
      required:
        - id
        - polling_url
      properties:
        id:
          type: string
        polling_url:
          type: string
        cost:
          type:
            - number
            - 'null'
          description: Cost in credits for this request.
        input_mp:
          type:
            - number
            - 'null'
          description: Input megapixels.
        output_mp:
          type:
            - number
            - 'null'
          description: Output megapixels.
    HTTPValidationError:
      type: object
      properties:
        detail:
          type: array
          items:
            $ref: '#/components/schemas/ValidationError'
    ValidationError:
      type: object
      required:
        - loc
        - msg
        - type
      properties:
        loc:
          type: array
          items:
            anyOf:
              - type: string
              - type: integer
        msg:
          type: string
        type:
          type: string
  securitySchemes:
    APIKeyHeader:
      type: apiKey
      in: header
      name: x-key

````