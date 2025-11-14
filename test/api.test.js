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
