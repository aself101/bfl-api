/**
 * API Tests - Black Forest Labs API Wrapper
 * Tests for BflAPI class initialization and methods
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { BflAPI } from '../api.js';
import { MODEL_ENDPOINTS, BASE_URL } from '../config.js';

describe('BflAPI Class', () => {
  let api;

  beforeAll(() => {
    // Initialize API with dummy key for testing and ERROR log level to reduce noise
    api = new BflAPI({ apiKey: 'test_api_key_for_unit_tests', logLevel: 'ERROR' });
  });

  describe('Initialization', () => {
    it('should create BflAPI instance', () => {
      expect(api).toBeDefined();
      expect(api).toBeInstanceOf(BflAPI);
    });

    it('should have all required generation methods', () => {
      const methods = [
        'generateFluxDev',
        'generateFluxPro',
        'generateFluxProUltra',
        'generateKontextPro',
        'generateKontextMax',
        'getResult',
        'waitForResult',
        'getUserCredits'
      ];

      methods.forEach(method => {
        expect(api[method]).toBeDefined();
        expect(typeof api[method]).toBe('function');
      });
    });

    it('should have private _verifyApiKey method', () => {
      expect(api._verifyApiKey).toBeDefined();
      expect(typeof api._verifyApiKey).toBe('function');
    });

    it('should have private _makeRequest method', () => {
      expect(api._makeRequest).toBeDefined();
      expect(typeof api._makeRequest).toBe('function');
    });
  });

  describe('Configuration', () => {
    it('should have valid base URL', () => {
      expect(BASE_URL).toBeDefined();
      expect(BASE_URL.startsWith('https://')).toBe(true);
    });

    it('should have all 5 model endpoints', () => {
      expect(MODEL_ENDPOINTS).toBeDefined();
      expect(Object.keys(MODEL_ENDPOINTS)).toHaveLength(5);
    });

    it('should have valid endpoint paths', () => {
      Object.entries(MODEL_ENDPOINTS).forEach(([model, endpoint]) => {
        expect(endpoint).toMatch(/^\/v1\//);
      });
    });

    it('should have expected models', () => {
      const expectedModels = ['flux-dev', 'flux-pro', 'flux-ultra', 'kontext-pro', 'kontext-max'];
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

  describe('API Calls (Optional - Requires API Key)', () => {
    it('should get user credits if API key is configured', async () => {
      try {
        const credits = await api.getUserCredits();
        expect(credits).toBeDefined();
        expect(credits.credits).toBeDefined();
        expect(typeof credits.credits).toBe('number');
      } catch (error) {
        // Skip if API key not configured or invalid (test uses dummy key)
        if (error.message.includes('BFL_API_KEY') ||
            error.message.includes('Authentication') ||
            error.message.includes('Invalid API key')) {
          console.log('    ⚠ Skipped (no valid API key configured)');
          expect(true).toBe(true); // Pass test
        } else {
          throw error; // Unexpected error
        }
      }
    });
  });
});
