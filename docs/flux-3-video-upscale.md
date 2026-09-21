> ## Documentation Index
> Fetch the complete documentation index at: https://docs.bfl.ml/llms.txt
> Use this file to discover all available pages before exploring further.

# Upscale a video with FLUX 3.

> Submits a video upscaling task: 1.5x-3x super-resolution of the source clip (up to 2560x1440 in, 13.75 MP output frames). The upscale covers the first 20 seconds of the source; clips well past that are rejected. `creativity` selects precise source-faithful upscaling (0) or creative detail enhancement (1).

1.5x-3x video super-resolution. Creative mode enhances detail; precise mode stays faithful to the source.


## OpenAPI

````yaml https://api.bfl.ai/openapi.json post /v1/flux-tools/video-upscale-v1
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
  /v1/flux-tools/video-upscale-v1:
    post:
      tags:
        - Models
      summary: Upscale a video with FLUX 3.
      description: >-
        Submits a video upscaling task: 1.5x-3x super-resolution of the source
        clip (up to 2560x1440 in, 13.75 MP output frames). The upscale covers
        the first 20 seconds of the source; clips well past that are rejected.
        `creativity` selects precise source-faithful upscaling (0) or creative
        detail enhancement (1).
      operationId: generate_flux_tools_video_upscale_v1_v1_flux_tools_video_upscale_v1_post
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Flux3VideoUpscaleInputs'
      responses:
        '200':
          description: Successful Response
          content:
            application/json:
              schema:
                anyOf:
                  - $ref: '#/components/schemas/AsyncResponse'
                  - $ref: '#/components/schemas/AsyncWebhookResponse'
                title: >-
                  Response Generate Flux Tools Video Upscale V1 V1 Flux Tools
                  Video Upscale V1 Post
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
    Flux3VideoUpscaleInputs:
      properties:
        user:
          anyOf:
            - type: string
              maxLength: 256
              minLength: 1
            - type: 'null'
          title: User
          description: Opaque identifier for the end user supplied by the calling platform.
        input_video:
          type: string
          title: Input Video
          description: >-
            The clip to upscale: base64-encoded mp4 (max 50MB) or an http(s)
            URL. The upscale covers the first 20 seconds; a clip slightly over
            that is upscaled up to the 20 second mark, and one well over is
            rejected. At most 2560x1440 (3.7 megapixels) per frame: this
            endpoint upscales toward 4K, so downscale a larger source before
            submitting it.
        prompt:
          type: string
          title: Prompt
          description: >-
            Optional description of the clip's content, steering the enhanced
            detail. Leave empty for a neutral upscale.
          default: ''
        creativity:
          type: integer
          enum:
            - 0
            - 1
          title: Creativity
          description: >-
            Upscale behavior: 0 preserves the source precisely; 1 allows
            creative detail enhancement.
          default: 1
        upscale_factor:
          type: number
          maximum: 3
          minimum: 1.5
          title: Upscale Factor
          description: >-
            Output scaling relative to the source resolution, between 1.5 and 3.
            The output preserves the source aspect ratio and is capped at a
            13.75 MP frame: very large sources are upscaled by less than the
            requested factor.
          default: 2
        safety_tolerance:
          type: integer
          maximum: 4
          minimum: 0
          title: Safety Tolerance
          description: >-
            Tolerance level for harm moderation, between 0 and 4 with 0 the
            strictest. It bounds every harm class on the prompt, which is
            screened before any generation, and on the delivered frames, which
            are withheld when their sexual-content level exceeds what the
            tolerance allows. Sexual is capped at level 3 and hate at level 2
            regardless of the requested tolerance.
          default: 2
        webhook_url:
          anyOf:
            - type: string
              maxLength: 2083
              minLength: 1
              format: uri
            - type: 'null'
          title: Webhook Url
          description: URL to receive the result callback.
        webhook_secret:
          anyOf:
            - type: string
              format: password
              writeOnly: true
            - type: 'null'
          title: Webhook Secret
          description: Secret echoed in the webhook signature header.
      additionalProperties: false
      type: object
      required:
        - input_video
      title: Flux3VideoUpscaleInputs
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