/**
 * Utility Functions Tests
 * Tests for file I/O, image conversion, and filename generation utilities
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, mkdirSync, rmdirSync } from 'fs';
import { join } from 'path';

// Mock DNS module before importing utils
vi.mock('dns/promises', () => ({
  lookup: vi.fn()
}));

import { promptToFilename, generateTimestampedFilename, validateImageUrl, validateImagePath, validateImageFile } from '../utils.js';
import { validateApiKeyFormat } from '../config.js';
import { lookup } from 'dns/promises';

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
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should accept valid HTTPS URLs with public IPs', async () => {
      // Mock DNS to return a public IP
      lookup.mockResolvedValue({ address: '8.8.8.8', family: 4 });
      await expect(validateImageUrl('https://example.com/image.jpg')).resolves.toBe('https://example.com/image.jpg');

      lookup.mockResolvedValue({ address: '8.8.8.8', family: 4 });
      await expect(validateImageUrl('https://cdn.example.com/path/to/image.png')).resolves.toBe('https://cdn.example.com/path/to/image.png');
    });

    it('should reject HTTP URLs', async () => {
      await expect(validateImageUrl('http://example.com/image.jpg')).rejects.toThrow('HTTPS');
    });

    it('should reject localhost', async () => {
      // localhost as hostname (blocked by hostname check, no DNS needed)
      await expect(validateImageUrl('https://localhost/image.jpg')).rejects.toThrow('metadata');

      // 127.0.0.1 as direct IP (no DNS lookup)
      await expect(validateImageUrl('https://127.0.0.1/image.jpg')).rejects.toThrow('private');
    });

    it('should reject private IP addresses', async () => {
      await expect(validateImageUrl('https://10.0.0.1/image.jpg')).rejects.toThrow('private');
      await expect(validateImageUrl('https://192.168.1.1/image.jpg')).rejects.toThrow('private');
      await expect(validateImageUrl('https://172.16.0.1/image.jpg')).rejects.toThrow('private');
    });

    it('should reject cloud metadata endpoints', async () => {
      // Direct IP address (no DNS lookup)
      await expect(validateImageUrl('https://169.254.169.254/latest/meta-data')).rejects.toThrow();

      // Domain name that's in blocklist (blocked by hostname check, no DNS needed)
      await expect(validateImageUrl('https://metadata.google.internal/computeMetadata')).rejects.toThrow('metadata');
    });

    it('should reject IPv4-mapped IPv6 localhost addresses (SSRF bypass prevention)', async () => {
      await expect(validateImageUrl('https://[::ffff:127.0.0.1]/image.jpg')).rejects.toThrow('localhost');
      await expect(validateImageUrl('https://[::FFFF:127.0.0.1]/image.jpg')).rejects.toThrow('localhost');
    });

    it('should reject IPv4-mapped IPv6 private IP addresses (SSRF bypass prevention)', async () => {
      await expect(validateImageUrl('https://[::ffff:10.0.0.1]/image.jpg')).rejects.toThrow('private');
      await expect(validateImageUrl('https://[::ffff:192.168.1.1]/image.jpg')).rejects.toThrow('private');
      await expect(validateImageUrl('https://[::ffff:172.16.0.1]/image.jpg')).rejects.toThrow('private');
    });

    it('should reject IPv4-mapped IPv6 cloud metadata endpoints (SSRF bypass prevention)', async () => {
      await expect(validateImageUrl('https://[::ffff:169.254.169.254]/latest/meta-data')).rejects.toThrow('private');
    });

    it('should reject invalid URLs', async () => {
      await expect(validateImageUrl('not-a-url')).rejects.toThrow('Invalid URL');
      await expect(validateImageUrl('ftp://example.com/file')).rejects.toThrow();
    });

    // DNS Rebinding Prevention Tests
    it('should reject domains resolving to localhost (DNS rebinding prevention)', async () => {
      lookup.mockResolvedValue({ address: '127.0.0.1', family: 4 });
      await expect(validateImageUrl('https://evil.com/image.jpg')).rejects.toThrow('resolves to internal/private IP');
    });

    it('should reject domains resolving to private IPs (DNS rebinding prevention)', async () => {
      // Test 10.x.x.x
      lookup.mockResolvedValue({ address: '10.0.0.1', family: 4 });
      await expect(validateImageUrl('https://evil.com/image.jpg')).rejects.toThrow('resolves to internal/private IP');

      // Test 192.168.x.x
      lookup.mockResolvedValue({ address: '192.168.1.1', family: 4 });
      await expect(validateImageUrl('https://evil2.com/image.jpg')).rejects.toThrow('resolves to internal/private IP');

      // Test 172.16-31.x.x
      lookup.mockResolvedValue({ address: '172.16.0.1', family: 4 });
      await expect(validateImageUrl('https://evil3.com/image.jpg')).rejects.toThrow('resolves to internal/private IP');
    });

    it('should reject domains resolving to cloud metadata IPs (DNS rebinding prevention)', async () => {
      lookup.mockResolvedValue({ address: '169.254.169.254', family: 4 });
      await expect(validateImageUrl('https://evil.com/image.jpg')).rejects.toThrow('resolves to internal/private IP');
    });

    it('should reject domains resolving to IPv6 loopback (DNS rebinding prevention)', async () => {
      lookup.mockResolvedValue({ address: '::1', family: 6 });
      await expect(validateImageUrl('https://evil.com/image.jpg')).rejects.toThrow('resolves to internal/private IP');
    });

    it('should reject domains resolving to IPv6 private addresses (DNS rebinding prevention)', async () => {
      // Test fe80: (link-local)
      lookup.mockResolvedValue({ address: 'fe80::1', family: 6 });
      await expect(validateImageUrl('https://evil.com/image.jpg')).rejects.toThrow('resolves to internal/private IP');

      // Test fc00: (unique local)
      lookup.mockResolvedValue({ address: 'fc00::1', family: 6 });
      await expect(validateImageUrl('https://evil2.com/image.jpg')).rejects.toThrow('resolves to internal/private IP');
    });

    it('should handle DNS lookup failures gracefully', async () => {
      lookup.mockRejectedValue({ code: 'ENOTFOUND' });
      await expect(validateImageUrl('https://nonexistent.domain.invalid/image.jpg')).rejects.toThrow('could not be resolved');
    });

    it('should handle DNS timeout errors gracefully', async () => {
      lookup.mockRejectedValue(new Error('ETIMEDOUT'));
      await expect(validateImageUrl('https://timeout.example.com/image.jpg')).rejects.toThrow('Failed to validate domain');
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
