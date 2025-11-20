/**
 * API Tests - Black Forest Labs API Wrapper
 * Tests for BflAPI class initialization and methods
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { BflAPI } from '../api.js';
import { MODEL_ENDPOINTS, BASE_URL } from '../config.js';
import axios from 'axios';

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

    it('should have all 7 model endpoints', () => {
      expect(MODEL_ENDPOINTS).toBeDefined();
      expect(Object.keys(MODEL_ENDPOINTS)).toHaveLength(7);
    });

    it('should have valid endpoint paths', () => {
      Object.entries(MODEL_ENDPOINTS).forEach(([model, endpoint]) => {
        expect(endpoint).toMatch(/^\/v1\//);
      });
    });

    it('should have expected models', () => {
      const expectedModels = ['flux-dev', 'flux-pro', 'flux-ultra', 'flux-pro-fill', 'kontext-pro', 'kontext-max'];
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
});
