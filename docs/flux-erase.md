> ## Documentation Index
> Fetch the complete documentation index at: https://docs.bfl.ml/llms.txt
> Use this file to discover all available pages before exploring further.

# Erase an object from an image

> Submits an erase task using an input image and a mask identifying the object or region to remove.



## OpenAPI

````yaml https://api.bfl.ai/openapi.json post /v1/flux-tools/erase-v1
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
  /v1/flux-tools/erase-v1:
    post:
      tags:
        - Models
      summary: Erase an object from an image
      description: >-
        Submits an erase task using an input image and a mask identifying the
        object or region to remove.
      operationId: generate_flux_tools_erase_v1_v1_flux_tools_erase_v1_post
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Flux2EraseInputs'
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
                  Response Generate Flux Tools Erase V1 V1 Flux Tools Erase V1
                  Post
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
    Flux2EraseInputs:
      properties:
        user:
          anyOf:
            - type: string
              maxLength: 256
              minLength: 1
            - type: 'null'
          title: User
          description: Opaque identifier for the end user supplied by the calling platform.
        image:
          type: string
          title: Image
          description: Base64-encoded input image or HTTP(S) image URL.
        mask:
          type: string
          title: Mask
          description: >-
            Base64-encoded black/white mask or HTTP(S) image URL. White pixels
            indicate the object to remove; black pixels are preserved. Must have
            the same dimensions as the input image.
        dilate_pixels:
          type: integer
          maximum: 25
          minimum: 0
          title: Dilate Pixels
          description: >-
            Number of pixels to dilate the mask by before removal. Dilation
            helps cover object edges. Maximum is 25 pixels.
          default: 10
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
            Tolerance level for input and output moderation. Between 0 and 5, 0
            being most strict, 5 being least strict.
          default: 2
          example: 2
        output_format:
          anyOf:
            - $ref: '#/components/schemas/OutputFormat'
            - type: 'null'
          default: png
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
        - image
        - mask
      title: Flux2EraseInputs
      description: Input model for public FLUX.2 erase.
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