/**
 * API Tests - Black Forest Labs API Wrapper
 * Tests for BflAPI class initialization and methods
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { BflAPI } from '../api.js';
import { MODEL_ENDPOINTS, BASE_URL } from '../config.js';
import axios from 'axios';
import * as config from '../config.js';

// Mock axios for all tests
vi.mock('axios');

describe('BflAPI Class', () => {
  let api;

  beforeAll(() => {
    // Initialize API with dummy key for testing and NONE log level to suppress all logs
    api = new BflAPI({ apiKey: 'test_api_key_for_unit_tests', logLevel: 'NONE' });
  });

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Reset mocks after each test
    vi.resetAllMocks();
  });

  describe('Initialization', () => {
    it('should create BflAPI instance', () => {
      expect(api).toBeDefined();
      expect(api).toBeInstanceOf(BflAPI);
    });
  });

  describe('Configuration', () => {
    it('should have valid base URL', () => {
      expect(BASE_URL).toBeDefined();
      expect(BASE_URL.startsWith('https://')).toBe(true);
    });

    it('should have all 10 model endpoints', () => {
      expect(MODEL_ENDPOINTS).toBeDefined();
      expect(Object.keys(MODEL_ENDPOINTS)).toHaveLength(10);
    });

    it('should have valid endpoint paths', () => {
      Object.entries(MODEL_ENDPOINTS).forEach(([model, endpoint]) => {
        expect(endpoint).toMatch(/^\/v1\//);
      });
    });

    it('should have expected models', () => {
      const expectedModels = ['flux-dev', 'flux-pro', 'flux-ultra', 'flux-pro-fill', 'kontext-pro', 'kontext-max', 'flux-2-pro', 'flux-2-flex'];
      expectedModels.forEach(model => {
        expect(MODEL_ENDPOINTS[model]).toBeDefined();
      });
    });
  });

  describe('Security Features', () => {
    it('should have _redactApiKey method', () => {
      expect(api._redactApiKey).toBeDefined();
      expect(typeof api._redactApiKey).toBe('function');
    });

    it('should redact API key showing only last 4 characters', () => {
      const testKey = 'sk-1234567890abcdef';
      const redacted = api._redactApiKey(testKey);
      expect(redacted).toBe('xxx...cdef');
      expect(redacted).not.toContain('1234567890');
    });

    it('should redact short API keys completely', () => {
      const shortKey = 'abc123';
      const redacted = api._redactApiKey(shortKey);
      expect(redacted).toBe('[REDACTED]');
    });

    it('should have _sanitizeErrorMessage method', () => {
      expect(api._sanitizeErrorMessage).toBeDefined();
      expect(typeof api._sanitizeErrorMessage).toBe('function');
    });

    it('should sanitize error messages in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = { response: { data: { detail: 'Sensitive error details' } }, message: 'Error' };
      const sanitized = api._sanitizeErrorMessage(error, 422);

      expect(sanitized).toBe('Invalid parameters');
      expect(sanitized).not.toContain('Sensitive');

      process.env.NODE_ENV = originalEnv;
    });

    it('should return detailed errors in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = { response: { data: { detail: 'Detailed error info' } }, message: 'Error' };
      const message = api._sanitizeErrorMessage(error, 422);

      expect(message).toContain('Detailed error info');

      process.env.NODE_ENV = originalEnv;
    });

    it('should reject non-HTTPS base URLs', () => {
      expect(() => {
        new BflAPI({ apiKey: 'test_key', baseUrl: 'http://insecure.example.com', logLevel: 'ERROR' });
      }).toThrow('must use HTTPS protocol');
    });

    it('should accept HTTPS base URLs', () => {
      expect(() => {
        new BflAPI({ apiKey: 'test_key', baseUrl: 'https://secure.example.com', logLevel: 'ERROR' });
      }).not.toThrow();
    });
  });

  describe('FLUX.1 [dev] Generation', () => {
    it('should generate image with FLUX.1 [dev] model', async () => {
      // Mock successful API response
      const mockResponse = {
        data: {
          id: 'task_123abc',
          status: 'Pending'
        }
      };
      axios.post.mockResolvedValue(mockResponse);

      const result = await api.generateFluxDev({
        prompt: 'a serene mountain landscape',
        width: 1024,
        height: 768,
        steps: 28,
        guidance: 3
      });

      // Verify correct endpoint called
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/v1/flux-dev'),
        expect.objectContaining({
          prompt: 'a serene mountain landscape',
          width: 1024,
          height: 768,
          steps: 28,
          guidance: 3
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-key': 'test_api_key_for_unit_tests',
            'Content-Type': 'application/json'
          })
        })
      );

      // Verify response handling
      expect(result.id).toBe('task_123abc');
      expect(result.status).toBe('Pending');
    });

    it('should use default values for optional parameters', async () => {
      const mockResponse = { data: { id: 'task_456', status: 'Pending' } };
      axios.post.mockResolvedValue(mockResponse);

      await api.generateFluxDev({ prompt: 'test prompt' });

      // Verify defaults were applied
      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          prompt: 'test prompt',
          width: 1024,  // default
          height: 768,  // default
          steps: 28,    // default
          guidance: 3   // default
        }),
        expect.any(Object)
      );
    });

    it('should include optional parameters when provided', async () => {
      const mockResponse = { data: { id: 'task_789', status: 'Pending' } };
      axios.post.mockResolvedValue(mockResponse);

      await api.generateFluxDev({
        prompt: 'test',
        seed: 42,
        safety_tolerance: 4,
        output_format: 'png',
        prompt_upsampling: true
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          seed: 42,
          safety_tolerance: 4,
          output_format: 'png',
          prompt_upsampling: true
        }),
        expect.any(Object)
      );
    });

    it('should handle API errors correctly', async () => {
      axios.post.mockRejectedValue({
        response: { status: 422, data: { detail: 'Invalid parameters' } },
        message: 'Request failed'
      });

      await expect(
        api.generateFluxDev({ prompt: 'test' })
      ).rejects.toThrow();
    });
  });

  describe('FLUX 1.1 [pro] Generation', () => {
    it('should generate image with FLUX 1.1 [pro] model', async () => {
      const mockResponse = {
        data: { id: 'task_pro_123', status: 'Pending' }
      };
      axios.post.mockResolvedValue(mockResponse);

      const result = await api.generateFluxPro({
        prompt: 'modern office interior',
        width: 1024,
        height: 1024,
        image_prompt: 'data:image/png;base64,iVBORw0K...'
      });

      // Verify correct endpoint
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/v1/flux-pro'),
        expect.objectContaining({
          prompt: 'modern office interior',
          width: 1024,
          height: 1024,
          image_prompt: 'data:image/png;base64,iVBORw0K...'
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-key': 'test_api_key_for_unit_tests'
          })
        })
      );

      expect(result.id).toBe('task_pro_123');
    });

    it('should handle image_prompt parameter correctly', async () => {
      const mockResponse = { data: { id: 'task_123', status: 'Pending' } };
      axios.post.mockResolvedValue(mockResponse);

      const imagePrompt = 'data:image/jpeg;base64,/9j/4AAQ...';
      await api.generateFluxPro({
        prompt: 'test',
        image_prompt: imagePrompt
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          image_prompt: imagePrompt
        }),
        expect.any(Object)
      );
    });
  });

  describe('FLUX 1.1 [pro] Ultra Generation', () => {
    it('should generate image with FLUX Ultra model', async () => {
      const mockResponse = {
        data: { id: 'task_ultra_123', status: 'Pending' }
      };
      axios.post.mockResolvedValue(mockResponse);

      const result = await api.generateFluxProUltra({
        prompt: 'cinematic landscape photography',
        aspect_ratio: '21:9',
        raw: true
      });

      // Verify correct endpoint and parameters
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/v1/flux-pro-1.1-ultra'),
        expect.objectContaining({
          prompt: 'cinematic landscape photography',
          aspect_ratio: '21:9',
          raw: true
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-key': 'test_api_key_for_unit_tests'
          })
        })
      );

      expect(result.id).toBe('task_ultra_123');
    });

    it('should use default aspect_ratio and raw values', async () => {
      const mockResponse = { data: { id: 'task_123', status: 'Pending' } };
      axios.post.mockResolvedValue(mockResponse);

      await api.generateFluxProUltra({ prompt: 'test' });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          aspect_ratio: '16:9',
          raw: false
        }),
        expect.any(Object)
      );
    });

    it('should include image_prompt and image_prompt_strength when provided', async () => {
      const mockResponse = { data: { id: 'task_123', status: 'Pending' } };
      axios.post.mockResolvedValue(mockResponse);

      await api.generateFluxProUltra({
        prompt: 'test',
        image_prompt: 'data:image/png;base64,abc',
        image_prompt_strength: 0.5
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          image_prompt: 'data:image/png;base64,abc',
          image_prompt_strength: 0.5
        }),
        expect.any(Object)
      );
    });
  });

  describe('Kontext Pro Generation', () => {
    it('should generate image with Kontext Pro model', async () => {
      const mockResponse = {
        data: { id: 'task_kontext_pro_123', status: 'Pending' }
      };
      axios.post.mockResolvedValue(mockResponse);

      const result = await api.generateKontextPro({
        prompt: 'A small furry elephant pet',
        input_image: 'data:image/png;base64,abc123'
      });

      // Verify correct endpoint
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/v1/flux-kontext-pro'),
        expect.objectContaining({
          prompt: 'A small furry elephant pet',
          input_image: 'data:image/png;base64,abc123'
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-key': 'test_api_key_for_unit_tests'
          })
        })
      );

      expect(result.id).toBe('task_kontext_pro_123');
    });

    it('should throw error if input_image is missing', async () => {
      await expect(
        api.generateKontextPro({ prompt: 'test' })
      ).rejects.toThrow('input_image is required for Kontext Pro');
    });

    it('should handle multiple reference images', async () => {
      const mockResponse = { data: { id: 'task_123', status: 'Pending' } };
      axios.post.mockResolvedValue(mockResponse);

      await api.generateKontextPro({
        prompt: 'test',
        input_image: 'data:image/png;base64,img1',
        input_image_2: 'data:image/png;base64,img2',
        input_image_3: 'data:image/png;base64,img3',
        input_image_4: 'data:image/png;base64,img4'
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          input_image: 'data:image/png;base64,img1',
          input_image_2: 'data:image/png;base64,img2',
          input_image_3: 'data:image/png;base64,img3',
          input_image_4: 'data:image/png;base64,img4'
        }),
        expect.any(Object)
      );
    });
  });

  describe('Kontext Max Generation', () => {
    it('should generate image with Kontext Max model', async () => {
      const mockResponse = {
        data: { id: 'task_kontext_max_123', status: 'Pending' }
      };
      axios.post.mockResolvedValue(mockResponse);

      const result = await api.generateKontextMax({
        prompt: 'Transform into watercolor painting',
        input_image: 'data:image/png;base64,xyz789'
      });

      // Verify correct endpoint
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/v1/flux-kontext-max'),
        expect.objectContaining({
          prompt: 'Transform into watercolor painting',
          input_image: 'data:image/png;base64,xyz789'
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-key': 'test_api_key_for_unit_tests'
          })
        })
      );

      expect(result.id).toBe('task_kontext_max_123');
    });

    it('should throw error if input_image is missing', async () => {
      await expect(
        api.generateKontextMax({ prompt: 'test' })
      ).rejects.toThrow('input_image is required for Kontext Max');
    });
  });

  describe('FLUX.1 Fill [pro] Generation', () => {
    it('should throw error if image is missing', async () => {
      await expect(async () => {
        await api.generateFluxProFill({
          prompt: 'A beautiful sunset'
        });
      }).rejects.toThrow('image is required for FLUX.1 Fill [pro]');
    });

    it('should throw error if prompt is missing', async () => {
      await expect(async () => {
        await api.generateFluxProFill({
          image: 'base64_encoded_image'
        });
      }).rejects.toThrow('prompt is required for FLUX.1 Fill [pro]');
    });

    it('should generate image with FLUX Fill model', async () => {
      const mockResponse = {
        data: { id: 'task_fill_123', status: 'Pending' }
      };
      axios.post.mockResolvedValue(mockResponse);

      const result = await api.generateFluxProFill({
        image: 'data:image/png;base64,abc123',
        prompt: 'A beautiful sunset sky',
        steps: 30,
        guidance: 3
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/v1/flux-pro-1.0-fill'),
        expect.objectContaining({
          image: 'data:image/png;base64,abc123',
          prompt: 'A beautiful sunset sky',
          steps: 30,
          guidance: 3
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-key': 'test_api_key_for_unit_tests'
          })
        })
      );

      expect(result.id).toBe('task_fill_123');
    });

    it('should handle mask parameter correctly', async () => {
      const mockResponse = { data: { id: 'task_123', status: 'Pending' } };
      axios.post.mockResolvedValue(mockResponse);

      await api.generateFluxProFill({
        image: 'data:image/png;base64,img',
        mask: 'data:image/png;base64,mask',
        prompt: 'Fill this area with grass'
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          image: 'data:image/png;base64,img',
          mask: 'data:image/png;base64,mask',
          prompt: 'Fill this area with grass'
        }),
        expect.any(Object)
      );
    });

    it('should include all optional parameters when provided', async () => {
      const mockResponse = { data: { id: 'task_123', status: 'Pending' } };
      axios.post.mockResolvedValue(mockResponse);

      await api.generateFluxProFill({
        image: 'data:image/png;base64,img',
        prompt: 'A sunset',
        mask: 'data:image/png;base64,mask',
        steps: 25,
        guidance: 5.5,
        seed: 12345,
        safety_tolerance: 4,
        output_format: 'png',
        prompt_upsampling: true
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          steps: 25,
          guidance: 5.5,
          seed: 12345,
          safety_tolerance: 4,
          output_format: 'png',
          prompt_upsampling: true
        }),
        expect.any(Object)
      );
    });
  });

  describe('FLUX.1 Fill [pro] Finetune Generation', () => {
    it('should throw error if API key is not set', async () => {
      // Mock getBflApiKey to return empty string
      const originalGetBflApiKey = config.getBflApiKey;
      vi.spyOn(config, 'getBflApiKey').mockReturnValue('');

      try {
        const apiWithoutKey = new BflAPI({ apiKey: '', logLevel: 'NONE' });

        await expect(async () => {
          await apiWithoutKey.generateFluxProFillFinetuned({
            finetune_id: 'my-model',
            image: 'data:image/png;base64,abc123'
          });
        }).rejects.toThrow('API key not set');

        // Verify axios.post was never called - fail fast before API call
        expect(axios.post).not.toHaveBeenCalled();
      } finally {
        // Restore original function
        config.getBflApiKey.mockRestore();
      }
    });

    it('should throw error if finetune_id is missing', async () => {
      await expect(async () => {
        await api.generateFluxProFillFinetuned({
          image: 'data:image/png;base64,abc123',
          prompt: 'Apply custom style'
        });
      }).rejects.toThrow('finetune_id is required for FLUX.1 Fill [pro] finetune');

      // Verify axios.post was never called - fail fast before API call
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should throw error if image is missing', async () => {
      await expect(async () => {
        await api.generateFluxProFillFinetuned({
          finetune_id: 'my-finetune',
          prompt: 'Apply custom style'
        });
      }).rejects.toThrow('image is required for FLUX.1 Fill [pro] finetune');

      // Verify axios.post was never called - fail fast before API call
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should generate image with finetune model', async () => {
      const mockResponse = {
        data: { id: 'task_finetune_123', status: 'Pending' }
      };
      axios.post.mockResolvedValue(mockResponse);

      const result = await api.generateFluxProFillFinetuned({
        finetune_id: 'my-custom-model',
        image: 'data:image/png;base64,abc123',
        prompt: 'Apply my custom style',
        finetune_strength: 1.2,
        steps: 35,
        guidance: 60
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/v1/flux-pro-1.0-fill-finetuned'),
        expect.objectContaining({
          finetune_id: 'my-custom-model',
          image: 'data:image/png;base64,abc123',
          prompt: 'Apply my custom style',
          finetune_strength: 1.2,
          steps: 35,
          guidance: 60
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-key': 'test_api_key_for_unit_tests'
          })
        })
      );

      expect(result.id).toBe('task_finetune_123');
    });

    it('should handle empty prompt (default to empty string)', async () => {
      const mockResponse = { data: { id: 'task_123', status: 'Pending' } };
      axios.post.mockResolvedValue(mockResponse);

      await api.generateFluxProFillFinetuned({
        finetune_id: 'my-model',
        image: 'data:image/png;base64,img'
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          finetune_id: 'my-model',
          image: 'data:image/png;base64,img',
          prompt: ''
        }),
        expect.any(Object)
      );
    });

    it('should handle mask parameter correctly', async () => {
      const mockResponse = { data: { id: 'task_123', status: 'Pending' } };
      axios.post.mockResolvedValue(mockResponse);

      await api.generateFluxProFillFinetuned({
        finetune_id: 'my-model',
        image: 'data:image/png;base64,img',
        mask: 'data:image/png;base64,mask',
        prompt: 'Fill with custom style'
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          finetune_id: 'my-model',
          image: 'data:image/png;base64,img',
          mask: 'data:image/png;base64,mask',
          prompt: 'Fill with custom style'
        }),
        expect.any(Object)
      );
    });

    it('should include all optional parameters when provided', async () => {
      const mockResponse = { data: { id: 'task_123', status: 'Pending' } };
      axios.post.mockResolvedValue(mockResponse);

      await api.generateFluxProFillFinetuned({
        finetune_id: 'my-model',
        image: 'data:image/png;base64,img',
        prompt: 'Custom style',
        mask: 'data:image/png;base64,mask',
        finetune_strength: 1.5,
        steps: 40,
        guidance: 70,
        seed: 54321,
        safety_tolerance: 3,
        output_format: 'png',
        prompt_upsampling: true
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          finetune_id: 'my-model',
          finetune_strength: 1.5,
          steps: 40,
          guidance: 70,
          seed: 54321,
          safety_tolerance: 3,
          output_format: 'png',
          prompt_upsampling: true
        }),
        expect.any(Object)
      );
    });

    it('should use exact endpoint for flux-pro-fill-finetuned', async () => {
      const mockResponse = {
        data: { id: 'task_123', status: 'Pending' }
      };
      axios.post.mockResolvedValue(mockResponse);

      await api.generateFluxProFillFinetuned({
        finetune_id: 'my-model',
        image: 'data:image/png;base64,abc123'
      });

      // Verify exact endpoint is used, not flux-pro-fill or other variants
      const callArgs = axios.post.mock.calls[0];
      expect(callArgs[0]).toBe('https://api.bfl.ai/v1/flux-pro-1.0-fill-finetuned');
    });

    it('should handle API authentication errors (401)', async () => {
      axios.post.mockRejectedValue({
        response: { status: 401 },
        message: 'Unauthorized'
      });

      await expect(async () => {
        await api.generateFluxProFillFinetuned({
          finetune_id: 'my-model',
          image: 'data:image/png;base64,abc123'
        });
      }).rejects.toThrow();
    });

    it('should handle invalid parameter errors (422)', async () => {
      axios.post.mockRejectedValue({
        response: {
          status: 422,
          data: { detail: 'Invalid finetune_id' }
        },
        message: 'Unprocessable Entity'
      });

      await expect(async () => {
        await api.generateFluxProFillFinetuned({
          finetune_id: 'invalid-model',
          image: 'data:image/png;base64,abc123'
        });
      }).rejects.toThrow();
    });

    it('should handle rate limiting errors (429)', async () => {
      axios.post.mockRejectedValue({
        response: { status: 429 },
        message: 'Too Many Requests'
      });

      await expect(async () => {
        await api.generateFluxProFillFinetuned({
          finetune_id: 'my-model',
          image: 'data:image/png;base64,abc123'
        });
      }).rejects.toThrow();
    });

    it('should handle server errors (502/503)', async () => {
      axios.post.mockRejectedValue({
        response: { status: 503 },
        message: 'Service Unavailable'
      });

      await expect(async () => {
        await api.generateFluxProFillFinetuned({
          finetune_id: 'my-model',
          image: 'data:image/png;base64,abc123'
        });
      }).rejects.toThrow();
    });
  });

  describe('FLUX.1 Expand [pro] Generation', () => {
    it('should throw error if image is missing', async () => {
      await expect(async () => {
        await api.generateFluxProExpand({
          prompt: 'Expand with clouds',
          top: 512
        });
      }).rejects.toThrow('image is required for FLUX.1 Expand [pro]');
    });

    it('should generate image with FLUX Expand model', async () => {
      const mockResponse = {
        data: { id: 'task_expand_123', status: 'Pending' }
      };
      axios.post.mockResolvedValue(mockResponse);

      const result = await api.generateFluxProExpand({
        image: 'data:image/png;base64,abc123',
        top: 512,
        bottom: 256,
        prompt: 'Extend with dramatic sky',
        steps: 30,
        guidance: 60
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/v1/flux-pro-1.0-expand'),
        expect.objectContaining({
          image: 'data:image/png;base64,abc123',
          top: 512,
          bottom: 256,
          prompt: 'Extend with dramatic sky',
          steps: 30,
          guidance: 60
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-key': 'test_api_key_for_unit_tests'
          })
        })
      );

      expect(result.id).toBe('task_expand_123');
    });

    it('should handle all expansion parameters', async () => {
      const mockResponse = { data: { id: 'task_123', status: 'Pending' } };
      axios.post.mockResolvedValue(mockResponse);

      await api.generateFluxProExpand({
        image: 'data:image/png;base64,img',
        top: 1024,
        bottom: 512,
        left: 256,
        right: 256
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          top: 1024,
          bottom: 512,
          left: 256,
          right: 256
        }),
        expect.any(Object)
      );
    });

    it('should include all optional parameters when provided', async () => {
      const mockResponse = { data: { id: 'task_123', status: 'Pending' } };
      axios.post.mockResolvedValue(mockResponse);

      await api.generateFluxProExpand({
        image: 'data:image/png;base64,img',
        top: 512,
        prompt: 'Add dramatic clouds',
        steps: 40,
        guidance: 70,
        seed: 12345,
        safety_tolerance: 4,
        output_format: 'png',
        prompt_upsampling: true
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          steps: 40,
          guidance: 70,
          seed: 12345,
          safety_tolerance: 4,
          output_format: 'png',
          prompt_upsampling: true
        }),
        expect.any(Object)
      );
    });
  });

  describe('FLUX.2 [PRO] Generation', () => {
    it('should generate image with FLUX.2 [PRO] model', async () => {
      const mockResponse = {
        data: {
          id: 'task_flux2_pro_123',
          polling_url: 'https://api.bfl.ai/v1/get_result?id=task_flux2_pro_123',
          cost: 5.0,
          input_mp: 1.05,
          output_mp: 1.05
        }
      };
      axios.post.mockResolvedValue(mockResponse);

      const result = await api.generateFlux2Pro({
        prompt: 'a majestic castle on a cliff',
        width: 1024,
        height: 1024
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/v1/flux-2-pro'),
        expect.objectContaining({
          prompt: 'a majestic castle on a cliff',
          width: 1024,
          height: 1024,
          prompt_upsampling: true  // default
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-key': 'test_api_key_for_unit_tests'
          })
        })
      );

      expect(result.id).toBe('task_flux2_pro_123');
      expect(result.cost).toBe(5.0);
      expect(result.input_mp).toBe(1.05);
      expect(result.output_mp).toBe(1.05);
    });

    it('should use prompt_upsampling true as default', async () => {
      const mockResponse = { data: { id: 'task_123', polling_url: '' } };
      axios.post.mockResolvedValue(mockResponse);

      await api.generateFlux2Pro({ prompt: 'test prompt' });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          prompt_upsampling: true
        }),
        expect.any(Object)
      );
    });

    it('should allow overriding prompt_upsampling to false', async () => {
      const mockResponse = { data: { id: 'task_123', polling_url: '' } };
      axios.post.mockResolvedValue(mockResponse);

      await api.generateFlux2Pro({
        prompt: 'test prompt',
        prompt_upsampling: false
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          prompt_upsampling: false
        }),
        expect.any(Object)
      );
    });

    it('should handle multi-image input (up to 8 images)', async () => {
      const mockResponse = { data: { id: 'task_123', polling_url: '' } };
      axios.post.mockResolvedValue(mockResponse);

      await api.generateFlux2Pro({
        prompt: 'combine elements from all images',
        input_image: 'data:image/png;base64,img1',
        input_image_2: 'data:image/png;base64,img2',
        input_image_3: 'data:image/png;base64,img3',
        input_image_4: 'data:image/png;base64,img4',
        input_image_5: 'data:image/png;base64,img5',
        input_image_6: 'data:image/png;base64,img6',
        input_image_7: 'data:image/png;base64,img7',
        input_image_8: 'data:image/png;base64,img8'
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          input_image: 'data:image/png;base64,img1',
          input_image_2: 'data:image/png;base64,img2',
          input_image_3: 'data:image/png;base64,img3',
          input_image_4: 'data:image/png;base64,img4',
          input_image_5: 'data:image/png;base64,img5',
          input_image_6: 'data:image/png;base64,img6',
          input_image_7: 'data:image/png;base64,img7',
          input_image_8: 'data:image/png;base64,img8'
        }),
        expect.any(Object)
      );
    });

    it('should include optional parameters when provided', async () => {
      const mockResponse = { data: { id: 'task_123', polling_url: '' } };
      axios.post.mockResolvedValue(mockResponse);

      await api.generateFlux2Pro({
        prompt: 'test',
        seed: 42,
        safety_tolerance: 3,
        output_format: 'png'
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          seed: 42,
          safety_tolerance: 3,
          output_format: 'png'
        }),
        expect.any(Object)
      );
    });

    it('should handle API errors correctly', async () => {
      axios.post.mockRejectedValue({
        response: { status: 422, data: { detail: 'Invalid parameters' } },
        message: 'Request failed'
      });

      await expect(
        api.generateFlux2Pro({ prompt: 'test' })
      ).rejects.toThrow();
    });

    it('should work with zero input images (text-to-image mode)', async () => {
      const mockResponse = { data: { id: 'task_123', polling_url: '' } };
      axios.post.mockResolvedValue(mockResponse);

      await api.generateFlux2Pro({
        prompt: 'a beautiful landscape',
        width: 1024,
        height: 768
      });

      const payload = axios.post.mock.calls[0][1];

      // Should not have any input_image keys
      expect(payload.input_image).toBeUndefined();
      expect(Object.keys(payload).filter(k => k.startsWith('input_image'))).toHaveLength(0);
    });

    it('should work with partial image count (3 images)', async () => {
      const mockResponse = { data: { id: 'task_123', polling_url: '' } };
      axios.post.mockResolvedValue(mockResponse);

      await api.generateFlux2Pro({
        prompt: 'combine these elements',
        input_image: 'data:image/png;base64,img1',
        input_image_2: 'data:image/png;base64,img2',
        input_image_3: 'data:image/png;base64,img3'
      });

      const payload = axios.post.mock.calls[0][1];

      // Should have exactly 3 input images
      expect(payload.input_image).toBe('data:image/png;base64,img1');
      expect(payload.input_image_2).toBe('data:image/png;base64,img2');
      expect(payload.input_image_3).toBe('data:image/png;base64,img3');
      expect(payload.input_image_4).toBeUndefined();
    });

    it('should include all parameters when provided', async () => {
      const mockResponse = { data: { id: 'task_123', polling_url: '' } };
      axios.post.mockResolvedValue(mockResponse);

      await api.generateFlux2Pro({
        prompt: 'test with all params',
        width: 1024,
        height: 768,
        seed: 12345,
        safety_tolerance: 2,
        output_format: 'png',
        prompt_upsampling: false,
        input_image: 'data:image/png;base64,img1'
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          prompt: 'test with all params',
          width: 1024,
          height: 768,
          seed: 12345,
          safety_tolerance: 2,
          output_format: 'png',
          prompt_upsampling: false,
          input_image: 'data:image/png;base64,img1'
        }),
        expect.any(Object)
      );
    });
  });

  describe('FLUX.2 [FLEX] Generation', () => {
    it('should generate image with FLUX.2 [FLEX] model', async () => {
      const mockResponse = {
        data: {
          id: 'task_flux2_flex_123',
          polling_url: 'https://api.bfl.ai/v1/get_result?id=task_flux2_flex_123',
          cost: 3.0,
          input_mp: 0.79,
          output_mp: 0.79
        }
      };
      axios.post.mockResolvedValue(mockResponse);

      const result = await api.generateFlux2Flex({
        prompt: 'a serene Japanese garden',
        width: 1024,
        height: 768
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/v1/flux-2-flex'),
        expect.objectContaining({
          prompt: 'a serene Japanese garden',
          width: 1024,
          height: 768,
          prompt_upsampling: true  // default
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-key': 'test_api_key_for_unit_tests'
          })
        })
      );

      expect(result.id).toBe('task_flux2_flex_123');
      expect(result.cost).toBe(3.0);
    });

    it('should use prompt_upsampling true as default', async () => {
      const mockResponse = { data: { id: 'task_123', polling_url: '' } };
      axios.post.mockResolvedValue(mockResponse);

      await api.generateFlux2Flex({ prompt: 'test prompt' });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          prompt_upsampling: true
        }),
        expect.any(Object)
      );
    });

    it('should handle multi-reference editing with multiple images', async () => {
      const mockResponse = { data: { id: 'task_123', polling_url: '' } };
      axios.post.mockResolvedValue(mockResponse);

      await api.generateFlux2Flex({
        prompt: 'combine the style and subject',
        input_image: 'data:image/png;base64,subject',
        input_image_2: 'data:image/png;base64,style_ref'
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          input_image: 'data:image/png;base64,subject',
          input_image_2: 'data:image/png;base64,style_ref'
        }),
        expect.any(Object)
      );
    });

    it('should support experimental multiref (images 5-8)', async () => {
      const mockResponse = { data: { id: 'task_123', polling_url: '' } };
      axios.post.mockResolvedValue(mockResponse);

      await api.generateFlux2Flex({
        prompt: 'create from multiple references',
        input_image_5: 'data:image/png;base64,experimental1',
        input_image_6: 'data:image/png;base64,experimental2'
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          input_image_5: 'data:image/png;base64,experimental1',
          input_image_6: 'data:image/png;base64,experimental2'
        }),
        expect.any(Object)
      );
    });

    it('should not require input_image (text-to-image mode)', async () => {
      const mockResponse = { data: { id: 'task_123', polling_url: '' } };
      axios.post.mockResolvedValue(mockResponse);

      // Should not throw - input_image is optional for text-to-image
      await api.generateFlux2Flex({
        prompt: 'a beautiful landscape',
        width: 1024,
        height: 768
      });

      expect(axios.post).toHaveBeenCalled();
    });

    it('should handle API errors correctly', async () => {
      axios.post.mockRejectedValue({
        response: { status: 401, data: { detail: 'Invalid API key' } },
        message: 'Unauthorized'
      });

      await expect(
        api.generateFlux2Flex({ prompt: 'test' })
      ).rejects.toThrow('Authentication failed');
    });
  });

  describe('Polling Logic - waitForResult', () => {
    it('should poll until task is ready', async () => {
      let pollCount = 0;

      // Mock GET requests - first 2 return Pending, 3rd returns Ready
      axios.get.mockImplementation(() => {
        pollCount++;
        if (pollCount < 3) {
          return Promise.resolve({
            data: {
              id: 'task_123',
              status: 'Pending'
            }
          });
        }
        return Promise.resolve({
          data: {
            id: 'task_123',
            status: 'Ready',
            result: {
              sample: 'https://example.com/image.png'
            }
          }
        });
      });

      const result = await api.waitForResult('task_123', {
        pollInterval: 0.01, // Fast polling for tests
        showSpinner: false
      });

      expect(pollCount).toBe(3);
      expect(result.status).toBe('Ready');
      expect(result.result.sample).toBe('https://example.com/image.png');
    });

    it('should timeout after max duration', async () => {
      // Mock always returns Pending
      axios.get.mockResolvedValue({
        data: {
          id: 'task_123',
          status: 'Pending'
        }
      });

      await expect(
        api.waitForResult('task_123', {
          pollInterval: 0.01,
          timeout: 0.05, // 50ms timeout
          showSpinner: false
        })
      ).rejects.toThrow('Timeout');
    });

    it('should throw error on Error status', async () => {
      axios.get.mockResolvedValue({
        data: {
          id: 'task_123',
          status: 'Error',
          result: {
            error: 'Generation failed due to invalid parameters'
          }
        }
      });

      await expect(
        api.waitForResult('task_123', { showSpinner: false })
      ).rejects.toThrow('Generation failed: Generation failed due to invalid parameters');
    });

    it('should throw error on Content Moderated status', async () => {
      axios.get.mockResolvedValue({
        data: {
          id: 'task_123',
          status: 'Content Moderated'
        }
      });

      await expect(
        api.waitForResult('task_123', { showSpinner: false })
      ).rejects.toThrow('Content was moderated');
    });

    it('should retry on transient errors with exponential backoff', async () => {
      let callCount = 0;

      axios.get.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('503 Service Unavailable'));
        }
        if (callCount === 2) {
          return Promise.reject(new Error('502 Bad Gateway'));
        }
        // Third call succeeds
        return Promise.resolve({
          data: {
            id: 'task_123',
            status: 'Ready',
            result: { sample: 'https://example.com/image.png' }
          }
        });
      });

      const result = await api.waitForResult('task_123', {
        pollInterval: 0.01,
        maxRetries: 3,
        showSpinner: false
      });

      expect(callCount).toBe(3);
      expect(result.status).toBe('Ready');
    });

    it('should not retry on moderation errors', async () => {
      let callCount = 0;

      axios.get.mockImplementation(() => {
        callCount++;
        return Promise.reject(new Error('Content was moderated'));
      });

      await expect(
        api.waitForResult('task_123', {
          maxRetries: 3,
          showSpinner: false
        })
      ).rejects.toThrow('Content was moderated');

      // Should only call once, not retry
      expect(callCount).toBe(1);
    });

    it('should fail after max retries on transient errors', async () => {
      axios.get.mockRejectedValue(new Error('503 Service Unavailable'));

      await expect(
        api.waitForResult('task_123', {
          pollInterval: 0.01,
          maxRetries: 2,
          showSpinner: false
        })
      ).rejects.toThrow('503 Service Unavailable');

      // Should try initial + 2 retries = 3 times
      expect(axios.get).toHaveBeenCalledTimes(3);
    });

    it('should handle Request Moderated status and continue polling', async () => {
      let pollCount = 0;

      axios.get.mockImplementation(() => {
        pollCount++;
        if (pollCount === 1) {
          return Promise.resolve({
            data: { id: 'task_123', status: 'Request Moderated' }
          });
        }
        return Promise.resolve({
          data: {
            id: 'task_123',
            status: 'Ready',
            result: { sample: 'https://example.com/image.png' }
          }
        });
      });

      const result = await api.waitForResult('task_123', {
        pollInterval: 0.01,
        showSpinner: false
      });

      expect(pollCount).toBe(2);
      expect(result.status).toBe('Ready');
    });
  });

  describe('Get Result - getResult', () => {
    it('should fetch task result using task ID', async () => {
      const mockResponse = {
        data: {
          id: 'task_123',
          status: 'Ready',
          result: {
            sample: 'https://example.com/image.png'
          }
        }
      };
      axios.get.mockResolvedValue(mockResponse);

      const result = await api.getResult('task_123');

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/v1/get_result?id=task_123'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-key': 'test_api_key_for_unit_tests'
          })
        })
      );

      expect(result.id).toBe('task_123');
      expect(result.status).toBe('Ready');
    });

    it('should use custom polling URL when provided', async () => {
      const mockResponse = {
        data: { id: 'task_123', status: 'Pending' }
      };
      axios.get.mockResolvedValue(mockResponse);

      await api.getResult('task_123', 'https://custom.api.url/result');

      expect(axios.get).toHaveBeenCalledWith(
        'https://custom.api.url/result',
        expect.any(Object)
      );
    });
  });

  describe('Get User Credits', () => {
    it('should fetch user credits from API', async () => {
      const mockResponse = {
        data: {
          credits: 150.5
        }
      };
      axios.get.mockResolvedValue(mockResponse);

      const credits = await api.getUserCredits();

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/v1/credits'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-key': 'test_api_key_for_unit_tests'
          })
        })
      );

      expect(credits).toBeDefined();
      expect(credits.credits).toBe(150.5);
    });

    it('should handle API errors when fetching credits', async () => {
      axios.get.mockRejectedValue({
        response: { status: 401 },
        message: 'Unauthorized'
      });

      await expect(
        api.getUserCredits()
      ).rejects.toThrow();
    });
  });

  describe('Get My Finetunes', () => {
    it('should fetch finetunes list from API', async () => {
      const mockResponse = {
        data: {
          finetunes: ['finetune-1', 'finetune-2', 'custom-model-abc']
        }
      };
      axios.get.mockResolvedValue(mockResponse);

      const result = await api.getMyFinetunes();

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/v1/my_finetunes'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-key': 'test_api_key_for_unit_tests'
          })
        })
      );

      expect(result.finetunes).toEqual(['finetune-1', 'finetune-2', 'custom-model-abc']);
      expect(result.finetunes).toHaveLength(3);
    });

    it('should handle empty finetunes list', async () => {
      const mockResponse = {
        data: {
          finetunes: []
        }
      };
      axios.get.mockResolvedValue(mockResponse);

      const result = await api.getMyFinetunes();

      expect(result.finetunes).toEqual([]);
      expect(result.finetunes).toHaveLength(0);
    });

    it('should throw error on API failure', async () => {
      axios.get.mockRejectedValue({
        response: { status: 401 },
        message: 'Unauthorized'
      });

      await expect(
        api.getMyFinetunes()
      ).rejects.toThrow();
    });

    it('should throw error on network failure', async () => {
      axios.get.mockRejectedValue({
        message: 'Network Error'
      });

      await expect(
        api.getMyFinetunes()
      ).rejects.toThrow();
    });
  });

  describe('Error Handling - Additional Status Codes', () => {
    it('should handle bad request errors (400)', async () => {
      axios.post.mockRejectedValue({
        response: {
          status: 400,
          data: { detail: 'Bad request - malformed parameters' }
        },
        message: 'Bad Request'
      });

      await expect(
        api.generateFluxDev({ prompt: 'test' })
      ).rejects.toThrow();
    });

    it('should handle forbidden errors (403)', async () => {
      axios.post.mockRejectedValue({
        response: {
          status: 403,
          data: { detail: 'Access forbidden - insufficient permissions' }
        },
        message: 'Forbidden'
      });

      await expect(
        api.generateFluxDev({ prompt: 'test' })
      ).rejects.toThrow();
    });

    it('should handle not found errors (404)', async () => {
      axios.post.mockRejectedValue({
        response: {
          status: 404,
          data: { detail: 'Endpoint not found' }
        },
        message: 'Not Found'
      });

      await expect(
        api.generateFluxDev({ prompt: 'test' })
      ).rejects.toThrow();
    });

    it('should handle internal server errors (500)', async () => {
      axios.post.mockRejectedValue({
        response: {
          status: 500,
          data: { detail: 'Internal server error' }
        },
        message: 'Internal Server Error'
      });

      await expect(
        api.generateFluxDev({ prompt: 'test' })
      ).rejects.toThrow();
    });

    it('should handle network errors without response', async () => {
      axios.post.mockRejectedValue({
        message: 'Network Error - ECONNREFUSED',
        code: 'ECONNREFUSED'
      });

      await expect(
        api.generateFluxDev({ prompt: 'test' })
      ).rejects.toThrow();
    });

    it('should handle timeout errors', async () => {
      axios.post.mockRejectedValue({
        message: 'timeout of 30000ms exceeded',
        code: 'ETIMEDOUT'
      });

      await expect(
        api.generateFluxDev({ prompt: 'test' })
      ).rejects.toThrow();
    });

    it('should handle DNS resolution errors', async () => {
      axios.post.mockRejectedValue({
        message: 'getaddrinfo ENOTFOUND api.bfl.ai',
        code: 'ENOTFOUND'
      });

      await expect(
        api.generateFluxDev({ prompt: 'test' })
      ).rejects.toThrow();
    });

    it('should handle connection reset errors', async () => {
      axios.post.mockRejectedValue({
        message: 'socket hang up',
        code: 'ECONNRESET'
      });

      await expect(
        api.generateFluxDev({ prompt: 'test' })
      ).rejects.toThrow();
    });

    it('should sanitize 400 errors in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      axios.post.mockRejectedValue({
        response: {
          status: 400,
          data: { detail: 'Sensitive internal error details' }
        },
        message: 'Bad Request'
      });

      try {
        await api.generateFluxDev({ prompt: 'test' });
      } catch (error) {
        // Should not contain sensitive details in production
        expect(error.message).not.toContain('Sensitive internal');
      }

      process.env.NODE_ENV = originalEnv;
    });

    it('should sanitize 403 errors in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      axios.post.mockRejectedValue({
        response: {
          status: 403,
          data: { detail: 'Detailed permission info' }
        },
        message: 'Forbidden'
      });

      try {
        await api.generateFluxDev({ prompt: 'test' });
      } catch (error) {
        // Should not contain detailed info in production
        expect(error.message).not.toContain('Detailed permission');
      }

      process.env.NODE_ENV = originalEnv;
    });

    it('should sanitize 500 errors in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      axios.post.mockRejectedValue({
        response: {
          status: 500,
          data: { detail: 'Internal stack trace and sensitive data' }
        },
        message: 'Internal Server Error'
      });

      try {
        await api.generateFluxDev({ prompt: 'test' });
      } catch (error) {
        // Should use generic message in production
        expect(error.message).not.toContain('stack trace');
        expect(error.message).not.toContain('sensitive data');
      }

      process.env.NODE_ENV = originalEnv;
    });
  });
});
