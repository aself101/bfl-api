/**
 * Configuration Tests
 * Tests for API configuration, endpoints, and constants
 */

import { describe, it, expect } from 'vitest';
import {
  BASE_URL,
  US_BASE_URL,
  MODEL_ENDPOINTS,
  DEFAULT_POLL_INTERVAL,
  DEFAULT_TIMEOUT,
  MAX_RETRIES,
  getOutputDir,
  getPollInterval,
  getTimeout
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
    it('should have all 5 model endpoints', () => {
      expect(MODEL_ENDPOINTS).toBeDefined();
      expect(Object.keys(MODEL_ENDPOINTS)).toHaveLength(5);
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
});
