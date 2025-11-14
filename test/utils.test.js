/**
 * Utility Functions Tests
 * Tests for file I/O, image conversion, and filename generation utilities
 */

import { describe, it, expect } from 'vitest';
import { promptToFilename, generateTimestampedFilename } from '../utils.js';
import { validateApiKeyFormat } from '../config.js';

describe('Utility Functions', () => {
  describe('promptToFilename', () => {
    it('should sanitize special characters', () => {
      const result = promptToFilename('Hello / World: Test!');
      expect(result).not.toContain('/');
      expect(result).not.toContain(':');
      expect(result).not.toContain('!');
    });

    it('should replace spaces with underscores', () => {
      const result = promptToFilename('hello world test');
      expect(result).toBe('hello_world_test');
    });

    it('should truncate long prompts', () => {
      const longPrompt = 'a'.repeat(200);
      const result = promptToFilename(longPrompt);
      expect(result.length).toBeLessThanOrEqual(50); // Default maxLength
    });

    it('should respect custom maxLength', () => {
      const longPrompt = 'a'.repeat(200);
      const result = promptToFilename(longPrompt, 30);
      expect(result.length).toBeLessThanOrEqual(30);
    });

    it('should handle empty string with default', () => {
      const result = promptToFilename('');
      expect(result).toBe('image');
    });

    it('should handle only special characters', () => {
      const result = promptToFilename('!!!@@@###');
      expect(result).toBe('image'); // Falls back to default
    });

    it('should convert to lowercase', () => {
      const result = promptToFilename('HELLO WORLD');
      expect(result).toBe('hello_world');
    });

    it('should remove leading/trailing underscores', () => {
      const result = promptToFilename('  hello world  ');
      expect(result).not.toMatch(/^_/);
      expect(result).not.toMatch(/_$/);
    });
  });

  describe('generateTimestampedFilename', () => {
    it('should generate filename with timestamp', () => {
      const result = generateTimestampedFilename('test', 'jpg');
      // Format: YYYY-MM-DD_HH-MM-SS-mmm_prefix.ext (includes milliseconds)
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}_test\.jpg$/);
    });

    it('should include base name in filename', () => {
      const result = generateTimestampedFilename('myimage', 'png');
      expect(result).toContain('myimage');
      expect(result).toMatch(/\.png$/); // Ends with .png
    });

    it('should handle different extensions', () => {
      const extensions = ['jpg', 'png', 'jpeg', 'webp'];
      extensions.forEach(ext => {
        const result = generateTimestampedFilename('test', ext);
        expect(result).toMatch(new RegExp(`\\.${ext}$`)); // Ends with .ext
      });
    });
  });
});

describe('Configuration Utilities', () => {
  describe('validateApiKeyFormat', () => {
    it('should reject empty string', () => {
      expect(validateApiKeyFormat('')).toBe(false);
    });

    it('should reject null', () => {
      expect(validateApiKeyFormat(null)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(validateApiKeyFormat(undefined)).toBe(false);
    });

    it('should reject short keys', () => {
      expect(validateApiKeyFormat('short')).toBe(false);
      expect(validateApiKeyFormat('abc123')).toBe(false);
    });

    it('should accept valid-looking keys', () => {
      expect(validateApiKeyFormat('this-is-a-valid-looking-api-key')).toBe(true);
      expect(validateApiKeyFormat('sk_test_1234567890abcdef')).toBe(true);
    });

    it('should require minimum length of 10', () => {
      expect(validateApiKeyFormat('a'.repeat(9))).toBe(false);
      expect(validateApiKeyFormat('a'.repeat(10))).toBe(true);
      expect(validateApiKeyFormat('a'.repeat(11))).toBe(true);
    });
  });
});
