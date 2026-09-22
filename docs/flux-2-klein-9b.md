> ## Documentation Index
> Fetch the complete documentation index at: https://docs.bfl.ml/llms.txt
> Use this file to discover all available pages before exploring further.

# Generate or edit an image with FLUX.2 [klein] 9B

> Submits an image generation or editing task with FLUX.2 [klein] 9B. Sub-second inference with open weights, balancing quality and speed.

Fastest and most affordable, with open weights. 9B balances quality and speed; 4B is the fastest. See [which model to use](/flux_2/flux2_overview#which-model-to-choose).


## OpenAPI

````yaml https://api.bfl.ai/openapi.json post /v1/flux-2-klein-9b
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
  /v1/flux-2-klein-9b:
    post:
      tags:
        - Models
      summary: Generate or edit an image with FLUX.2 [klein] 9B
      description: >-
        Submits an image generation or editing task with FLUX.2 [klein] 9B.
        Sub-second inference with open weights, balancing quality and speed.
      operationId: generate_flux_2_klein_9b_v1_flux_2_klein_9b_post
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Flux2KleinInputs'
      responses:
        '200':
          description: Successful Response
          content:
            application/json:
              schema:
                anyOf:
                  - $ref: '#/components/schemas/AsyncResponse'
                  - $ref: '#/components/schemas/AsyncWebhookResponse'
                title: Response Generate Flux 2 Klein 9B V1 Flux 2 Klein 9B Post
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
    Flux2KleinInputs:
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
          description: Text prompt for image generation.
          example: ein fantastisches bild
        input_image:
          anyOf:
            - type: string
            - type: 'null'
          title: Input Image
          description: Path to the input image.
        input_image_2:
          anyOf:
            - type: string
            - type: 'null'
          title: Input Image 2
          description: Path to the second input image.
        input_image_3:
          anyOf:
            - type: string
            - type: 'null'
          title: Input Image 3
          description: Path to the third input image.
        input_image_4:
          anyOf:
            - type: string
            - type: 'null'
          title: Input Image 4
          description: Path to the fourth input image.
        seed:
          anyOf:
            - type: integer
            - type: 'null'
          title: Seed
          description: Optional seed for reproducibility.
          example: 42
        width:
          anyOf:
            - type: integer
              minimum: 64
            - type: 'null'
          title: Width
          description: Width of the image
          default: 0
        height:
          anyOf:
            - type: integer
              minimum: 64
            - type: 'null'
          title: Height
          description: Height of the image
          default: 0
        safety_tolerance:
          type: integer
          maximum: 5
          minimum: 0
          title: Safety Tolerance
          description: >-
            Tolerance level for input and output moderation. Between 0 and 5, 0
            being most strict, 5 being least strict. If you wish to increase the
            safety_tolerance beyond these levels please reach out to the team.
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
      title: Flux2KleinInputs
      description: Input model for FLUX.2 Klein (non-base) - like Pro but max 4 images.
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