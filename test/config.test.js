/**
 * Configuration Tests
 * Tests for API configuration, endpoints, and constants
 */

import { describe, it, expect } from 'vitest';
import {
  BASE_URL,
  US_BASE_URL,
  MODEL_ENDPOINTS,
  MODEL_CONSTRAINTS,
  DEFAULT_POLL_INTERVAL,
  DEFAULT_TIMEOUT,
  MAX_RETRIES,
  getOutputDir,
  getPollInterval,
  getTimeout,
  validateModelParams,
  getModelConstraints
} from '../config.js';

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
    it('should have all 6 model endpoints', () => {
      expect(MODEL_ENDPOINTS).toBeDefined();
      expect(Object.keys(MODEL_ENDPOINTS)).toHaveLength(6);
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

    it('should have valid endpoint paths', () => {
      Object.values(MODEL_ENDPOINTS).forEach(endpoint => {
        expect(endpoint).toMatch(/^\/v1\//);
      });
    });
  });
});

describe('Configuration Functions', () => {
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
          guidance: 3
        });
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject width not divisible by 32', () => {
        const result = validateModelParams('flux-dev', { width: 1000 });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('divisible by 32'))).toBe(true);
      });

      it('should reject width out of range', () => {
        const result = validateModelParams('flux-dev', { width: 2000 });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Width must be between'))).toBe(true);
      });

      it('should reject steps out of range', () => {
        const result = validateModelParams('flux-dev', { steps: 100 });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Steps must be between'))).toBe(true);
      });

      it('should reject guidance out of range', () => {
        const result = validateModelParams('flux-dev', { guidance: 10 });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Guidance must be between'))).toBe(true);
      });
    });

    describe('flux-ultra validation', () => {
      it('should accept valid aspect ratios', () => {
        const validRatios = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', '9:21'];
        validRatios.forEach(ratio => {
          const result = validateModelParams('flux-ultra', { aspect_ratio: ratio });
          expect(result.valid).toBe(true);
        });
      });

      it('should reject invalid aspect ratio', () => {
        const result = validateModelParams('flux-ultra', { aspect_ratio: '32:9' });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Invalid aspect_ratio'))).toBe(true);
      });

      it('should validate image_prompt_strength range', () => {
        const validResult = validateModelParams('flux-ultra', { image_prompt_strength: 0.5 });
        expect(validResult.valid).toBe(true);

        const invalidResult = validateModelParams('flux-ultra', { image_prompt_strength: 2 });
        expect(invalidResult.valid).toBe(false);
        expect(invalidResult.errors.some(e => e.includes('image_prompt_strength'))).toBe(true);
      });
    });

    describe('flux-pro-fill validation', () => {
      it('should accept valid flux-pro-fill parameters', () => {
        const result = validateModelParams('flux-pro-fill', {
          prompt: 'fill with grass',
          steps: 30,
          guidance: 5.5,
          safety_tolerance: 3,
          output_format: 'png'
        });
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject steps below minimum (15)', () => {
        const result = validateModelParams('flux-pro-fill', { steps: 10 });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Steps must be between 15 and 50'))).toBe(true);
      });

      it('should reject steps above maximum (50)', () => {
        const result = validateModelParams('flux-pro-fill', { steps: 60 });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Steps must be between 15 and 50'))).toBe(true);
      });

      it('should accept steps within valid range', () => {
        const result = validateModelParams('flux-pro-fill', { steps: 30 });
        expect(result.valid).toBe(true);
      });

      it('should reject guidance below minimum (1.5)', () => {
        const result = validateModelParams('flux-pro-fill', { guidance: 1.0 });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Guidance must be between 1.5 and 100'))).toBe(true);
      });

      it('should reject guidance above maximum (100)', () => {
        const result = validateModelParams('flux-pro-fill', { guidance: 150 });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Guidance must be between 1.5 and 100'))).toBe(true);
      });

      it('should accept guidance within valid range', () => {
        const result = validateModelParams('flux-pro-fill', { guidance: 50 });
        expect(result.valid).toBe(true);
      });

      it('should reject safety_tolerance below minimum (0)', () => {
        const result = validateModelParams('flux-pro-fill', { safety_tolerance: -1 });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('safety_tolerance must be between 0 and 6'))).toBe(true);
      });

      it('should reject safety_tolerance above maximum (6)', () => {
        const result = validateModelParams('flux-pro-fill', { safety_tolerance: 7 });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('safety_tolerance must be between 0 and 6'))).toBe(true);
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
        expect(result.errors.some(e => e.includes('Invalid output_format'))).toBe(true);
      });
    });

    describe('prompt length validation', () => {
      it('should reject prompts exceeding max length', () => {
        const longPrompt = 'a'.repeat(10001);
        const result = validateModelParams('flux-dev', { prompt: longPrompt });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Prompt exceeds maximum length'))).toBe(true);
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
        expect(result.errors.some(e => e.includes('Unknown model'))).toBe(true);
      });
    });
  });

  describe('getModelConstraints', () => {
    it('should return constraints for valid model', () => {
      const constraints = getModelConstraints('flux-dev');
      expect(constraints).toBeDefined();
      expect(constraints.width).toBeDefined();
      expect(constraints.steps).toBeDefined();
    });

    it('should return null for invalid model', () => {
      const constraints = getModelConstraints('invalid-model');
      expect(constraints).toBeNull();
    });
  });
});
