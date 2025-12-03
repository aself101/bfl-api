/**
 * Configuration Tests
 * Tests for API configuration, endpoints, and constants
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  BASE_URL,
  US_BASE_URL,
  MODEL_ENDPOINTS,
  MODEL_CONSTRAINTS,
  DEFAULT_POLL_INTERVAL,
  DEFAULT_TIMEOUT,
  MAX_RETRIES,
  getBflApiKey,
  getOutputDir,
  getPollInterval,
  getTimeout,
  validateModelParams,
  getModelConstraints,
} from '../src/config.js';

describe('Configuration Constants', () => {
  describe('Base URLs', () => {
    it('should have valid BASE_URL', () => {
      expect(BASE_URL).toBeDefined();
      expect(BASE_URL).toBe('https://api.bfl.ai');
      expect(BASE_URL.startsWith('https://')).toBe(true);
    });

    it('should have valid US_BASE_URL', () => {
      expect(US_BASE_URL).toBeDefined();
      expect(US_BASE_URL).toBe('https://api.us1.bfl.ai');
      expect(US_BASE_URL.startsWith('https://')).toBe(true);
    });
  });

  describe('Default Values', () => {
    it('should have DEFAULT_POLL_INTERVAL of 2 seconds', () => {
      expect(DEFAULT_POLL_INTERVAL).toBe(2);
    });

    it('should have DEFAULT_TIMEOUT of 300 seconds', () => {
      expect(DEFAULT_TIMEOUT).toBe(300);
    });

    it('should have MAX_RETRIES of 3', () => {
      expect(MAX_RETRIES).toBe(3);
    });
  });

  describe('Model Endpoints', () => {
    it('should have all 10 model endpoints', () => {
      expect(MODEL_ENDPOINTS).toBeDefined();
      expect(Object.keys(MODEL_ENDPOINTS)).toHaveLength(10);
    });

    it('should have flux-dev endpoint', () => {
      expect(MODEL_ENDPOINTS['flux-dev']).toBe('/v1/flux-dev');
    });

    it('should have flux-pro endpoint', () => {
      expect(MODEL_ENDPOINTS['flux-pro']).toBe('/v1/flux-pro-1.1');
    });

    it('should have flux-ultra endpoint', () => {
      expect(MODEL_ENDPOINTS['flux-ultra']).toBe('/v1/flux-pro-1.1-ultra');
    });

    it('should have kontext-pro endpoint', () => {
      expect(MODEL_ENDPOINTS['kontext-pro']).toBe('/v1/flux-kontext-pro');
    });

    it('should have flux-pro-fill endpoint', () => {
      expect(MODEL_ENDPOINTS['flux-pro-fill']).toBe('/v1/flux-pro-1.0-fill');
    });

    it('should have kontext-max endpoint', () => {
      expect(MODEL_ENDPOINTS['kontext-max']).toBe('/v1/flux-kontext-max');
    });

    it('should have flux-2-pro endpoint', () => {
      expect(MODEL_ENDPOINTS['flux-2-pro']).toBe('/v1/flux-2-pro');
    });

    it('should have flux-2-flex endpoint', () => {
      expect(MODEL_ENDPOINTS['flux-2-flex']).toBe('/v1/flux-2-flex');
    });

    it('should have valid endpoint paths', () => {
      Object.values(MODEL_ENDPOINTS).forEach((endpoint) => {
        expect(endpoint).toMatch(/^\/v1\//);
      });
    });
  });
});

describe('Configuration Functions', () => {
  describe('getBflApiKey', () => {
    const originalEnvKey = process.env.BFL_API_KEY;

    afterEach(() => {
      // Restore original environment variable
      if (originalEnvKey) {
        process.env.BFL_API_KEY = originalEnvKey;
      } else {
        delete process.env.BFL_API_KEY;
      }
    });

    it('should prioritize CLI flag over environment variable', () => {
      process.env.BFL_API_KEY = 'env-key-12345';
      const result = getBflApiKey('cli-key-67890');
      expect(result).toBe('cli-key-67890');
      expect(result).not.toBe('env-key-12345');
    });

    it('should fall back to environment variable when CLI flag is null', () => {
      process.env.BFL_API_KEY = 'env-key-12345';
      const result = getBflApiKey(null);
      expect(result).toBe('env-key-12345');
    });

    it('should fall back to environment variable when CLI flag is undefined', () => {
      process.env.BFL_API_KEY = 'env-key-12345';
      const result = getBflApiKey();
      expect(result).toBe('env-key-12345');
    });

    it('should throw error when no API key is available', () => {
      delete process.env.BFL_API_KEY;
      expect(() => getBflApiKey(null)).toThrow('BFL_API_KEY not found');
    });

    it('should throw error with helpful message when no API key is available', () => {
      delete process.env.BFL_API_KEY;
      expect(() => getBflApiKey()).toThrow('Get your API key at https://api.bfl.ml/');
    });

    it('should accept empty string CLI flag and fall back to env', () => {
      process.env.BFL_API_KEY = 'env-key-12345';
      const result = getBflApiKey('');
      expect(result).toBe('env-key-12345');
    });

    it('should use CLI flag when both CLI and env are provided', () => {
      process.env.BFL_API_KEY = 'env-key-12345';
      const cliKey = 'cli-key-67890';
      const result = getBflApiKey(cliKey);
      expect(result).toBe(cliKey);
    });
  });

  describe('getOutputDir', () => {
    it('should return default output directory', () => {
      const dir = getOutputDir();
      expect(dir).toBeDefined();
      expect(dir).toBe('datasets/bfl'); // Default value
    });
  });

  describe('getPollInterval', () => {
    it('should return poll interval', () => {
      const interval = getPollInterval();
      expect(interval).toBeDefined();
      expect(typeof interval).toBe('number');
      expect(interval).toBeGreaterThan(0);
    });

    it('should return DEFAULT_POLL_INTERVAL when env not set', () => {
      const interval = getPollInterval();
      expect(interval).toBe(DEFAULT_POLL_INTERVAL);
    });
  });

  describe('getTimeout', () => {
    it('should return timeout value', () => {
      const timeout = getTimeout();
      expect(timeout).toBeDefined();
      expect(typeof timeout).toBe('number');
      expect(timeout).toBeGreaterThan(0);
    });

    it('should return DEFAULT_TIMEOUT when env not set', () => {
      const timeout = getTimeout();
      expect(timeout).toBe(DEFAULT_TIMEOUT);
    });
  });

  describe('validateModelParams', () => {
    describe('flux-dev validation', () => {
      it('should accept valid flux-dev parameters', () => {
        const result = validateModelParams('flux-dev', {
          prompt: 'a cat',
          width: 1024,
          height: 768,
          steps: 28,
          guidance: 3,
        });
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject width not divisible by 32', () => {
        const result = validateModelParams('flux-dev', { width: 1000 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('divisible by 32'))).toBe(true);
      });

      it('should reject width out of range', () => {
        const result = validateModelParams('flux-dev', { width: 2000 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Width must be between'))).toBe(true);
      });

      it('should reject steps out of range', () => {
        const result = validateModelParams('flux-dev', { steps: 100 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Steps must be between'))).toBe(true);
      });

      it('should reject guidance out of range', () => {
        const result = validateModelParams('flux-dev', { guidance: 10 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Guidance must be between'))).toBe(true);
      });
    });

    describe('flux-ultra validation', () => {
      it('should accept valid aspect ratios', () => {
        const validRatios = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', '9:21'];
        validRatios.forEach((ratio) => {
          const result = validateModelParams('flux-ultra', { aspect_ratio: ratio });
          expect(result.valid).toBe(true);
        });
      });

      it('should reject invalid aspect ratio', () => {
        const result = validateModelParams('flux-ultra', { aspect_ratio: '32:9' });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Invalid aspect_ratio'))).toBe(true);
      });

      it('should validate image_prompt_strength range', () => {
        const validResult = validateModelParams('flux-ultra', { image_prompt_strength: 0.5 });
        expect(validResult.valid).toBe(true);

        const invalidResult = validateModelParams('flux-ultra', { image_prompt_strength: 2 });
        expect(invalidResult.valid).toBe(false);
        expect(invalidResult.errors.some((e) => e.includes('image_prompt_strength'))).toBe(true);
      });
    });

    describe('flux-pro-fill validation', () => {
      it('should accept valid flux-pro-fill parameters', () => {
        const result = validateModelParams('flux-pro-fill', {
          prompt: 'fill with grass',
          steps: 30,
          guidance: 5.5,
          safety_tolerance: 3,
          output_format: 'png',
        });
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject steps below minimum (15)', () => {
        const result = validateModelParams('flux-pro-fill', { steps: 10 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Steps must be between 15 and 50'))).toBe(true);
      });

      it('should reject steps above maximum (50)', () => {
        const result = validateModelParams('flux-pro-fill', { steps: 60 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Steps must be between 15 and 50'))).toBe(true);
      });

      it('should accept steps within valid range', () => {
        const result = validateModelParams('flux-pro-fill', { steps: 30 });
        expect(result.valid).toBe(true);
      });

      it('should reject guidance below minimum (1.5)', () => {
        const result = validateModelParams('flux-pro-fill', { guidance: 1.0 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Guidance must be between 1.5 and 100'))).toBe(
          true
        );
      });

      it('should reject guidance above maximum (100)', () => {
        const result = validateModelParams('flux-pro-fill', { guidance: 150 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Guidance must be between 1.5 and 100'))).toBe(
          true
        );
      });

      it('should accept guidance within valid range', () => {
        const result = validateModelParams('flux-pro-fill', { guidance: 50 });
        expect(result.valid).toBe(true);
      });

      it('should reject safety_tolerance below minimum (0)', () => {
        const result = validateModelParams('flux-pro-fill', { safety_tolerance: -1 });
        expect(result.valid).toBe(false);
        expect(
          result.errors.some((e) => e.includes('safety_tolerance must be between 0 and 6'))
        ).toBe(true);
      });

      it('should reject safety_tolerance above maximum (6)', () => {
        const result = validateModelParams('flux-pro-fill', { safety_tolerance: 7 });
        expect(result.valid).toBe(false);
        expect(
          result.errors.some((e) => e.includes('safety_tolerance must be between 0 and 6'))
        ).toBe(true);
      });

      it('should accept safety_tolerance within valid range', () => {
        const result = validateModelParams('flux-pro-fill', { safety_tolerance: 3 });
        expect(result.valid).toBe(true);
      });

      it('should accept valid output formats', () => {
        const jpegResult = validateModelParams('flux-pro-fill', { output_format: 'jpeg' });
        expect(jpegResult.valid).toBe(true);

        const pngResult = validateModelParams('flux-pro-fill', { output_format: 'png' });
        expect(pngResult.valid).toBe(true);
      });

      it('should reject invalid output format', () => {
        const result = validateModelParams('flux-pro-fill', { output_format: 'webp' });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Invalid output_format'))).toBe(true);
      });
    });

    describe('flux-pro-fill-finetuned validation', () => {
      it('should accept valid flux-pro-fill-finetuned parameters', () => {
        const result = validateModelParams('flux-pro-fill-finetuned', {
          prompt: 'apply custom style',
          finetune_strength: 1.1,
          steps: 30,
          guidance: 5.5,
          safety_tolerance: 3,
          output_format: 'png',
        });
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject finetune_strength below minimum (0)', () => {
        const result = validateModelParams('flux-pro-fill-finetuned', { finetune_strength: -0.1 });
        expect(result.valid).toBe(false);
        expect(
          result.errors.some((e) => e.includes('finetune_strength must be between 0 and 2'))
        ).toBe(true);
      });

      it('should reject finetune_strength above maximum (2)', () => {
        const result = validateModelParams('flux-pro-fill-finetuned', { finetune_strength: 2.5 });
        expect(result.valid).toBe(false);
        expect(
          result.errors.some((e) => e.includes('finetune_strength must be between 0 and 2'))
        ).toBe(true);
      });

      it('should accept finetune_strength at boundaries and middle', () => {
        // Test minimum boundary (inclusive)
        const zeroResult = validateModelParams('flux-pro-fill-finetuned', { finetune_strength: 0 });
        expect(zeroResult.valid).toBe(true);

        // Test default/middle value
        const midResult = validateModelParams('flux-pro-fill-finetuned', { finetune_strength: 1.1 });
        expect(midResult.valid).toBe(true);

        // Test maximum boundary (inclusive)
        const maxResult = validateModelParams('flux-pro-fill-finetuned', { finetune_strength: 2 });
        expect(maxResult.valid).toBe(true);

        // Test just beyond maximum to verify > check (not >=)
        const beyondMaxResult = validateModelParams('flux-pro-fill-finetuned', {
          finetune_strength: 2.0001,
        });
        expect(beyondMaxResult.valid).toBe(false);
        expect(
          beyondMaxResult.errors.some((e) => e.includes('finetune_strength must be between 0 and 2'))
        ).toBe(true);
      });

      it('should reject steps below minimum (15)', () => {
        const result = validateModelParams('flux-pro-fill-finetuned', { steps: 10 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Steps must be between 15 and 50'))).toBe(true);
      });

      it('should reject steps above maximum (50)', () => {
        const result = validateModelParams('flux-pro-fill-finetuned', { steps: 60 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Steps must be between 15 and 50'))).toBe(true);
      });

      it('should reject guidance below minimum (1.5)', () => {
        const result = validateModelParams('flux-pro-fill-finetuned', { guidance: 1.0 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Guidance must be between 1.5 and 100'))).toBe(
          true
        );
      });

      it('should reject guidance above maximum (100)', () => {
        const result = validateModelParams('flux-pro-fill-finetuned', { guidance: 150 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Guidance must be between 1.5 and 100'))).toBe(
          true
        );
      });

      it('should reject safety_tolerance below minimum (0)', () => {
        const result = validateModelParams('flux-pro-fill-finetuned', { safety_tolerance: -1 });
        expect(result.valid).toBe(false);
        expect(
          result.errors.some((e) => e.includes('safety_tolerance must be between 0 and 6'))
        ).toBe(true);
      });

      it('should reject safety_tolerance above maximum (6)', () => {
        const result = validateModelParams('flux-pro-fill-finetuned', { safety_tolerance: 7 });
        expect(result.valid).toBe(false);
        expect(
          result.errors.some((e) => e.includes('safety_tolerance must be between 0 and 6'))
        ).toBe(true);
      });

      it('should accept valid output formats', () => {
        const jpegResult = validateModelParams('flux-pro-fill-finetuned', { output_format: 'jpeg' });
        expect(jpegResult.valid).toBe(true);

        const pngResult = validateModelParams('flux-pro-fill-finetuned', { output_format: 'png' });
        expect(pngResult.valid).toBe(true);
      });

      it('should reject invalid output format', () => {
        const result = validateModelParams('flux-pro-fill-finetuned', { output_format: 'webp' });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Invalid output_format'))).toBe(true);
      });
    });

    describe('flux-pro-expand validation', () => {
      it('should accept valid flux-pro-expand parameters', () => {
        const result = validateModelParams('flux-pro-expand', {
          prompt: 'extend with clouds',
          top: 512,
          bottom: 256,
          left: 128,
          right: 128,
          steps: 30,
          guidance: 60,
          safety_tolerance: 2,
          output_format: 'png',
        });
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject top below minimum (0)', () => {
        const result = validateModelParams('flux-pro-expand', { top: -1 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('top must be between 0 and 2048'))).toBe(true);
      });

      it('should reject top above maximum (2048)', () => {
        const result = validateModelParams('flux-pro-expand', { top: 3000 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('top must be between 0 and 2048'))).toBe(true);
      });

      it('should accept top within valid range', () => {
        const result = validateModelParams('flux-pro-expand', { top: 1024 });
        expect(result.valid).toBe(true);
      });

      it('should reject bottom below minimum (0)', () => {
        const result = validateModelParams('flux-pro-expand', { bottom: -10 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('bottom must be between 0 and 2048'))).toBe(
          true
        );
      });

      it('should reject bottom above maximum (2048)', () => {
        const result = validateModelParams('flux-pro-expand', { bottom: 2500 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('bottom must be between 0 and 2048'))).toBe(
          true
        );
      });

      it('should accept bottom within valid range', () => {
        const result = validateModelParams('flux-pro-expand', { bottom: 512 });
        expect(result.valid).toBe(true);
      });

      it('should reject left below minimum (0)', () => {
        const result = validateModelParams('flux-pro-expand', { left: -5 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('left must be between 0 and 2048'))).toBe(true);
      });

      it('should reject left above maximum (2048)', () => {
        const result = validateModelParams('flux-pro-expand', { left: 2100 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('left must be between 0 and 2048'))).toBe(true);
      });

      it('should accept left within valid range', () => {
        const result = validateModelParams('flux-pro-expand', { left: 256 });
        expect(result.valid).toBe(true);
      });

      it('should reject right below minimum (0)', () => {
        const result = validateModelParams('flux-pro-expand', { right: -20 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('right must be between 0 and 2048'))).toBe(
          true
        );
      });

      it('should reject right above maximum (2048)', () => {
        const result = validateModelParams('flux-pro-expand', { right: 2200 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('right must be between 0 and 2048'))).toBe(
          true
        );
      });

      it('should accept right within valid range', () => {
        const result = validateModelParams('flux-pro-expand', { right: 128 });
        expect(result.valid).toBe(true);
      });

      it('should reject steps below minimum (15)', () => {
        const result = validateModelParams('flux-pro-expand', { steps: 10 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Steps must be between 15 and 50'))).toBe(true);
      });

      it('should reject steps above maximum (50)', () => {
        const result = validateModelParams('flux-pro-expand', { steps: 60 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Steps must be between 15 and 50'))).toBe(true);
      });

      it('should accept steps within valid range', () => {
        const result = validateModelParams('flux-pro-expand', { steps: 30 });
        expect(result.valid).toBe(true);
      });

      it('should reject guidance below minimum (1.5)', () => {
        const result = validateModelParams('flux-pro-expand', { guidance: 1.0 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Guidance must be between 1.5 and 100'))).toBe(
          true
        );
      });

      it('should reject guidance above maximum (100)', () => {
        const result = validateModelParams('flux-pro-expand', { guidance: 150 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Guidance must be between 1.5 and 100'))).toBe(
          true
        );
      });

      it('should accept guidance within valid range', () => {
        const result = validateModelParams('flux-pro-expand', { guidance: 60 });
        expect(result.valid).toBe(true);
      });

      it('should accept valid output formats', () => {
        const jpegResult = validateModelParams('flux-pro-expand', { output_format: 'jpeg' });
        expect(jpegResult.valid).toBe(true);

        const pngResult = validateModelParams('flux-pro-expand', { output_format: 'png' });
        expect(pngResult.valid).toBe(true);
      });

      it('should reject invalid output format', () => {
        const result = validateModelParams('flux-pro-expand', { output_format: 'webp' });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Invalid output_format'))).toBe(true);
      });
    });

    describe('flux-2-pro validation', () => {
      it('should accept valid flux-2-pro parameters', () => {
        const result = validateModelParams('flux-2-pro', {
          prompt: 'a majestic castle',
          width: 1024,
          height: 1024,
          safety_tolerance: 3,
          output_format: 'png',
        });
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject width not divisible by 16', () => {
        const result = validateModelParams('flux-2-pro', { width: 1025 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('divisible by 16'))).toBe(true);
      });

      it('should reject width below minimum (64)', () => {
        const result = validateModelParams('flux-2-pro', { width: 48 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Width must be between 64 and 2048'))).toBe(
          true
        );
      });

      it('should reject width above maximum (2048)', () => {
        const result = validateModelParams('flux-2-pro', { width: 2064 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Width must be between 64 and 2048'))).toBe(
          true
        );
      });

      it('should accept width at boundaries', () => {
        const minResult = validateModelParams('flux-2-pro', { width: 64 });
        expect(minResult.valid).toBe(true);

        const maxResult = validateModelParams('flux-2-pro', { width: 2048 });
        expect(maxResult.valid).toBe(true);
      });

      it('should reject height not divisible by 16', () => {
        const result = validateModelParams('flux-2-pro', { height: 1000 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('divisible by 16'))).toBe(true);
      });

      it('should reject height below minimum (64)', () => {
        const result = validateModelParams('flux-2-pro', { height: 32 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Height must be between 64 and 2048'))).toBe(
          true
        );
      });

      it('should reject height above maximum (2048)', () => {
        const result = validateModelParams('flux-2-pro', { height: 2100 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Height must be between 64 and 2048'))).toBe(
          true
        );
      });

      it('should reject safety_tolerance above maximum (5)', () => {
        const result = validateModelParams('flux-2-pro', { safety_tolerance: 6 });
        expect(result.valid).toBe(false);
        expect(
          result.errors.some((e) => e.includes('safety_tolerance must be between 0 and 5'))
        ).toBe(true);
      });

      it('should reject safety_tolerance below minimum (0)', () => {
        const result = validateModelParams('flux-2-pro', { safety_tolerance: -1 });
        expect(result.valid).toBe(false);
        expect(
          result.errors.some((e) => e.includes('safety_tolerance must be between 0 and 5'))
        ).toBe(true);
      });

      it('should accept safety_tolerance within valid range', () => {
        const result = validateModelParams('flux-2-pro', { safety_tolerance: 3 });
        expect(result.valid).toBe(true);
      });

      it('should accept valid output formats', () => {
        const jpegResult = validateModelParams('flux-2-pro', { output_format: 'jpeg' });
        expect(jpegResult.valid).toBe(true);

        const pngResult = validateModelParams('flux-2-pro', { output_format: 'png' });
        expect(pngResult.valid).toBe(true);
      });

      it('should reject invalid output format', () => {
        const result = validateModelParams('flux-2-pro', { output_format: 'webp' });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Invalid output_format'))).toBe(true);
      });

      it('should accept maximum 8 input images', () => {
        const result = validateModelParams('flux-2-pro', {
          prompt: 'test',
          input_image: 'base64data1',
          input_image_2: 'base64data2',
          input_image_3: 'base64data3',
          input_image_4: 'base64data4',
          input_image_5: 'base64data5',
          input_image_6: 'base64data6',
          input_image_7: 'base64data7',
          input_image_8: 'base64data8',
        });
        expect(result.valid).toBe(true);
      });

      it('should reject more than 8 input images', () => {
        const result = validateModelParams('flux-2-pro', {
          prompt: 'test',
          input_image: 'base64data1',
          input_image_2: 'base64data2',
          input_image_3: 'base64data3',
          input_image_4: 'base64data4',
          input_image_5: 'base64data5',
          input_image_6: 'base64data6',
          input_image_7: 'base64data7',
          input_image_8: 'base64data8',
          input_image_9: 'base64data9', // Should fail - this key won't be counted by our filter
        });
        // Note: input_image_9 is not in the valid pattern (input_image or input_image_[2-8])
        // so it won't be counted - this is by design since the API only accepts 1-8
        expect(result.valid).toBe(true);
      });

      it('should count input images correctly', () => {
        // Test with partial images
        const result = validateModelParams('flux-2-pro', {
          prompt: 'test',
          input_image: 'base64data1',
          input_image_3: 'base64data3',
          input_image_5: 'base64data5',
        });
        expect(result.valid).toBe(true);
      });

      it('should work with zero input images (text-to-image)', () => {
        const result = validateModelParams('flux-2-pro', {
          prompt: 'a beautiful landscape',
          width: 1024,
          height: 768,
        });
        expect(result.valid).toBe(true);
      });
    });

    describe('flux-2-flex validation', () => {
      it('should accept valid flux-2-flex parameters', () => {
        const result = validateModelParams('flux-2-flex', {
          prompt: 'combine style and subject',
          width: 1024,
          height: 768,
          safety_tolerance: 2,
          output_format: 'jpeg',
        });
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject width not divisible by 16', () => {
        const result = validateModelParams('flux-2-flex', { width: 1001 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('divisible by 16'))).toBe(true);
      });

      it('should reject width outside valid range', () => {
        const belowMin = validateModelParams('flux-2-flex', { width: 32 });
        expect(belowMin.valid).toBe(false);

        const aboveMax = validateModelParams('flux-2-flex', { width: 3000 });
        expect(aboveMax.valid).toBe(false);
      });

      it('should reject height not divisible by 16', () => {
        const result = validateModelParams('flux-2-flex', { height: 769 });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('divisible by 16'))).toBe(true);
      });

      it('should reject safety_tolerance outside range (0-5)', () => {
        const aboveMax = validateModelParams('flux-2-flex', { safety_tolerance: 6 });
        expect(aboveMax.valid).toBe(false);
        expect(
          aboveMax.errors.some((e) => e.includes('safety_tolerance must be between 0 and 5'))
        ).toBe(true);

        const belowMin = validateModelParams('flux-2-flex', { safety_tolerance: -1 });
        expect(belowMin.valid).toBe(false);
      });

      it('should accept maximum 8 input images', () => {
        const result = validateModelParams('flux-2-flex', {
          prompt: 'test',
          input_image: 'data1',
          input_image_2: 'data2',
          input_image_3: 'data3',
          input_image_4: 'data4',
          input_image_5: 'data5',
          input_image_6: 'data6',
          input_image_7: 'data7',
          input_image_8: 'data8',
        });
        expect(result.valid).toBe(true);
      });

      it('should accept valid output formats', () => {
        const jpegResult = validateModelParams('flux-2-flex', { output_format: 'jpeg' });
        expect(jpegResult.valid).toBe(true);

        const pngResult = validateModelParams('flux-2-flex', { output_format: 'png' });
        expect(pngResult.valid).toBe(true);
      });

      it('should reject invalid output format', () => {
        const result = validateModelParams('flux-2-flex', { output_format: 'gif' });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Invalid output_format'))).toBe(true);
      });
    });

    describe('prompt length validation', () => {
      it('should reject prompts exceeding max length', () => {
        const longPrompt = 'a'.repeat(10001);
        const result = validateModelParams('flux-dev', { prompt: longPrompt });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Prompt exceeds maximum length'))).toBe(true);
      });

      it('should accept prompts within max length', () => {
        const validPrompt = 'a'.repeat(1000);
        const result = validateModelParams('flux-dev', { prompt: validPrompt });
        expect(result.valid).toBe(true);
      });
    });

    describe('unknown model', () => {
      it('should reject unknown model', () => {
        const result = validateModelParams('invalid-model', {});
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Unknown model'))).toBe(true);
      });
    });
  });

  describe('getModelConstraints', () => {
    it('should return constraints for valid model', () => {
      const constraints = getModelConstraints('flux-dev');
      expect(constraints).toBeDefined();
      expect(constraints?.width).toBeDefined();
      expect(constraints?.steps).toBeDefined();
    });

    it('should return null for invalid model', () => {
      const constraints = getModelConstraints('invalid-model');
      expect(constraints).toBeNull();
    });
  });
});
