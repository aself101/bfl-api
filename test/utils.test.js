/**
 * Utility Functions Tests
 * Tests for file I/O, image conversion, and filename generation utilities
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promptToFilename, generateTimestampedFilename, validateImageUrl, validateImagePath, validateImageFile } from '../utils.js';
import { validateApiKeyFormat } from '../config.js';
import { writeFileSync, unlinkSync, mkdirSync, rmdirSync } from 'fs';
import { join } from 'path';

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

describe('Image Validation (Security)', () => {
  describe('validateImageUrl', () => {
    it('should accept valid HTTPS URLs', () => {
      expect(() => validateImageUrl('https://example.com/image.jpg')).not.toThrow();
      expect(() => validateImageUrl('https://cdn.example.com/path/to/image.png')).not.toThrow();
    });

    it('should reject HTTP URLs', () => {
      expect(() => validateImageUrl('http://example.com/image.jpg')).toThrow('HTTPS');
    });

    it('should reject localhost', () => {
      expect(() => validateImageUrl('https://localhost/image.jpg')).toThrow('localhost');
      expect(() => validateImageUrl('https://127.0.0.1/image.jpg')).toThrow('localhost');
    });

    it('should reject private IP addresses', () => {
      expect(() => validateImageUrl('https://10.0.0.1/image.jpg')).toThrow('private');
      expect(() => validateImageUrl('https://192.168.1.1/image.jpg')).toThrow('private');
      expect(() => validateImageUrl('https://172.16.0.1/image.jpg')).toThrow('private');
    });

    it('should reject cloud metadata endpoints', () => {
      expect(() => validateImageUrl('https://169.254.169.254/latest/meta-data')).toThrow();
      expect(() => validateImageUrl('https://metadata.google.internal/computeMetadata')).toThrow('metadata');
    });

    it('should reject IPv4-mapped IPv6 localhost addresses (SSRF bypass prevention)', () => {
      expect(() => validateImageUrl('https://[::ffff:127.0.0.1]/image.jpg')).toThrow('localhost');
      expect(() => validateImageUrl('https://[::FFFF:127.0.0.1]/image.jpg')).toThrow('localhost');
    });

    it('should reject IPv4-mapped IPv6 private IP addresses (SSRF bypass prevention)', () => {
      expect(() => validateImageUrl('https://[::ffff:10.0.0.1]/image.jpg')).toThrow('private');
      expect(() => validateImageUrl('https://[::ffff:192.168.1.1]/image.jpg')).toThrow('private');
      expect(() => validateImageUrl('https://[::ffff:172.16.0.1]/image.jpg')).toThrow('private');
    });

    it('should reject IPv4-mapped IPv6 cloud metadata endpoints (SSRF bypass prevention)', () => {
      expect(() => validateImageUrl('https://[::ffff:169.254.169.254]/latest/meta-data')).toThrow('private');
    });

    it('should reject invalid URLs', () => {
      expect(() => validateImageUrl('not-a-url')).toThrow('Invalid URL');
      expect(() => validateImageUrl('ftp://example.com/file')).toThrow();
    });
  });

  describe('validateImagePath', () => {
    const testDir = join(process.cwd(), 'test-temp');
    const pngFile = join(testDir, 'test.png');
    const jpegFile = join(testDir, 'test.jpg');
    const invalidFile = join(testDir, 'test.txt');

    // Setup test files
    beforeAll(() => {
      try { mkdirSync(testDir, { recursive: true }); } catch (e) {}

      // Create valid PNG file (PNG magic bytes: 89 50 4E 47)
      writeFileSync(pngFile, Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...new Array(100).fill(0)]));

      // Create valid JPEG file (JPEG magic bytes: FF D8 FF)
      writeFileSync(jpegFile, Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...new Array(100).fill(0)]));

      // Create invalid file (text file)
      writeFileSync(invalidFile, 'This is not an image');
    });

    afterAll(() => {
      try { unlinkSync(pngFile); } catch (e) {}
      try { unlinkSync(jpegFile); } catch (e) {}
      try { unlinkSync(invalidFile); } catch (e) {}
      try { rmdirSync(testDir); } catch (e) {}
    });

    it('should accept valid PNG files', async () => {
      await expect(validateImagePath(pngFile)).resolves.toBe(pngFile);
    });

    it('should accept valid JPEG files', async () => {
      await expect(validateImagePath(jpegFile)).resolves.toBe(jpegFile);
    });

    it('should reject non-image files', async () => {
      await expect(validateImagePath(invalidFile)).rejects.toThrow('does not appear to be a valid image');
    });

    it('should reject non-existent files', async () => {
      await expect(validateImagePath('/nonexistent/file.jpg')).rejects.toThrow('not found');
    });
  });

  describe('validateImageFile', () => {
    const testDir = join(process.cwd(), 'test-temp');
    const smallFile = join(testDir, 'small.png');
    const largeFile = join(testDir, 'large.png');

    beforeAll(() => {
      try { mkdirSync(testDir, { recursive: true }); } catch (e) {}

      // Create small file (1KB)
      writeFileSync(smallFile, Buffer.from([0x89, 0x50, 0x4E, 0x47, ...new Array(1000).fill(0)]));

      // Create large file (2MB)
      writeFileSync(largeFile, Buffer.from([0x89, 0x50, 0x4E, 0x47, ...new Array(2 * 1024 * 1024).fill(0)]));
    });

    afterAll(() => {
      try { unlinkSync(smallFile); } catch (e) {}
      try { unlinkSync(largeFile); } catch (e) {}
      try { rmdirSync(testDir); } catch (e) {}
    });

    it('should accept file within size constraints', async () => {
      const result = await validateImageFile(smallFile, { maxSize: 5 * 1024 * 1024 }); // 5MB
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject file exceeding size constraints', async () => {
      const result = await validateImageFile(largeFile, { maxSize: 1 * 1024 * 1024 }); // 1MB
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('exceeds maximum'))).toBe(true);
    });

    it('should accept valid file formats', async () => {
      const result = await validateImageFile(smallFile, { formats: ['png', 'jpg', 'jpeg'] });
      expect(result.valid).toBe(true);
    });

    it('should reject invalid file formats', async () => {
      const result = await validateImageFile(smallFile, { formats: ['jpg', 'jpeg'] });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('not supported'))).toBe(true);
    });

    it('should reject non-existent files', async () => {
      const result = await validateImageFile('/nonexistent/file.jpg');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('not found'))).toBe(true);
    });
  });
});
