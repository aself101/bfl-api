> ## Documentation Index
> Fetch the complete documentation index at: https://docs.bfl.ml/llms.txt
> Use this file to discover all available pages before exploring further.

# Virtual try-on (v2)

> Submits a virtual try-on task against the v2 model. Identical request shape to /vto-v1, with reference and output resolution supported up to 4MP. Person and garment images are mapped to the underlying input image slots. An edit instruction is generated from the person and garment images, with the supplied prompt used as a fallback.



## OpenAPI

````yaml https://api.bfl.ai/openapi.json post /v1/flux-tools/vto-v2
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
  /v1/flux-tools/vto-v2:
    post:
      tags:
        - Models
      summary: Virtual try-on (v2)
      description: >-
        Submits a virtual try-on task against the v2 model. Identical request
        shape to /vto-v1, with reference and output resolution supported up to
        4MP. Person and garment images are mapped to the underlying input image
        slots. An edit instruction is generated from the person and garment
        images, with the supplied prompt used as a fallback.
      operationId: generate_flux_tools_vto_v2_v1_flux_tools_vto_v2_post
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Flux2KleinTryonInputs'
      responses:
        '200':
          description: Successful Response
          content:
            application/json:
              schema:
                anyOf:
                  - $ref: '#/components/schemas/AsyncResponse'
                  - $ref: '#/components/schemas/AsyncWebhookResponse'
                title: Response Generate Flux Tools Vto V2 V1 Flux Tools Vto V2 Post
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
    Flux2KleinTryonInputs:
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
          description: Text prompt for VTO generation.
          example: 'TRY-ON: The person of image 1 wearing the garments of image 2.'
        person:
          type: string
          title: Person
          description: Person image (maps internally to input_image).
        garment:
          type: string
          title: Garment
          description: Image of one more garments (maps internally to input_image_2).
        seed:
          anyOf:
            - type: integer
            - type: 'null'
          title: Seed
          description: Optional seed for reproducibility.
          example: 42
        safety_tolerance:
          type: integer
          maximum: 5
          minimum: 0
          title: Safety Tolerance
          description: >-
            Tolerance level for input and output moderation. Between 0 and 5 for
            public use.
          default: 2
        output_format:
          anyOf:
            - $ref: '#/components/schemas/OutputFormat'
            - type: 'null'
          default: jpeg
        webhook_url:
          anyOf:
            - type: string
              maxLength: 2083
              minLength: 1
              format: uri
            - type: 'null'
          title: Webhook Url
          description: URL to receive webhook notifications
        webhook_secret:
          anyOf:
            - type: string
            - type: 'null'
          title: Webhook Secret
          description: Optional secret for webhook signature verification
      type: object
      required:
        - prompt
        - person
        - garment
      title: Flux2KleinTryonInputs
      description: |-
        Input model for FLUX.2 Klein VTO endpoint.

        Exposes only person/garment image fields for cleaner API ergonomics.
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
    OutputFormat:
      type: string
      enum:
        - jpeg
        - png
        - webp
      title: OutputFormat
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