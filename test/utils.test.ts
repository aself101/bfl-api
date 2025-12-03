/**
 * Utility Functions Tests
 * Tests for file I/O, image conversion, and filename generation utilities
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, mkdirSync, rmdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

// Mock DNS module before importing utils
vi.mock('dns/promises', () => ({
  lookup: vi.fn()
}));

import {
  promptToFilename,
  generateTimestampedFilename,
  validateImageUrl,
  validateImagePath,
  validateImageFile,
  ensureDirectory,
  writeToFile,
  readFromFile,
  fileToBase64,
  urlToBase64,
  imageToBase64,
  downloadImage,
  pause,
  randomNumber
} from '../src/utils.js';
import { validateApiKeyFormat } from '../src/config.js';
import { lookup } from 'dns/promises';
import axios from 'axios';

// Mock axios for URL tests
vi.mock('axios');

const mockedLookup = vi.mocked(lookup);
const mockedAxios = vi.mocked(axios, true);

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
      expect(validateApiKeyFormat(null as unknown as string)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(validateApiKeyFormat(undefined as unknown as string)).toBe(false);
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
      mockedLookup.mockResolvedValue({ address: '8.8.8.8', family: 4 });
      await expect(validateImageUrl('https://example.com/image.jpg')).resolves.toBe('https://example.com/image.jpg');

      mockedLookup.mockResolvedValue({ address: '8.8.8.8', family: 4 });
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
      mockedLookup.mockResolvedValue({ address: '127.0.0.1', family: 4 });
      await expect(validateImageUrl('https://evil.com/image.jpg')).rejects.toThrow('resolves to internal/private IP');
    });

    it('should reject domains resolving to private IPs (DNS rebinding prevention)', async () => {
      // Test 10.x.x.x
      mockedLookup.mockResolvedValue({ address: '10.0.0.1', family: 4 });
      await expect(validateImageUrl('https://evil.com/image.jpg')).rejects.toThrow('resolves to internal/private IP');

      // Test 192.168.x.x
      mockedLookup.mockResolvedValue({ address: '192.168.1.1', family: 4 });
      await expect(validateImageUrl('https://evil2.com/image.jpg')).rejects.toThrow('resolves to internal/private IP');

      // Test 172.16-31.x.x
      mockedLookup.mockResolvedValue({ address: '172.16.0.1', family: 4 });
      await expect(validateImageUrl('https://evil3.com/image.jpg')).rejects.toThrow('resolves to internal/private IP');
    });

    it('should reject domains resolving to cloud metadata IPs (DNS rebinding prevention)', async () => {
      mockedLookup.mockResolvedValue({ address: '169.254.169.254', family: 4 });
      await expect(validateImageUrl('https://evil.com/image.jpg')).rejects.toThrow('resolves to internal/private IP');
    });

    it('should reject domains resolving to IPv6 loopback (DNS rebinding prevention)', async () => {
      mockedLookup.mockResolvedValue({ address: '::1', family: 6 });
      await expect(validateImageUrl('https://evil.com/image.jpg')).rejects.toThrow('resolves to internal/private IP');
    });

    it('should reject domains resolving to IPv6 private addresses (DNS rebinding prevention)', async () => {
      // Test fe80: (link-local)
      mockedLookup.mockResolvedValue({ address: 'fe80::1', family: 6 });
      await expect(validateImageUrl('https://evil.com/image.jpg')).rejects.toThrow('resolves to internal/private IP');

      // Test fc00: (unique local)
      mockedLookup.mockResolvedValue({ address: 'fc00::1', family: 6 });
      await expect(validateImageUrl('https://evil2.com/image.jpg')).rejects.toThrow('resolves to internal/private IP');
    });

    it('should handle DNS lookup failures gracefully', async () => {
      mockedLookup.mockRejectedValue({ code: 'ENOTFOUND' });
      await expect(validateImageUrl('https://nonexistent.domain.invalid/image.jpg')).rejects.toThrow('could not be resolved');
    });

    it('should handle DNS timeout errors gracefully', async () => {
      mockedLookup.mockRejectedValue(new Error('ETIMEDOUT'));
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
      try { mkdirSync(testDir, { recursive: true }); } catch (e) { /* ignore */ }

      // Create valid PNG file (PNG magic bytes: 89 50 4E 47)
      writeFileSync(pngFile, Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...new Array(100).fill(0)]));

      // Create valid JPEG file (JPEG magic bytes: FF D8 FF)
      writeFileSync(jpegFile, Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...new Array(100).fill(0)]));

      // Create invalid file (text file)
      writeFileSync(invalidFile, 'This is not an image');
    });

    afterAll(() => {
      try { unlinkSync(pngFile); } catch (e) { /* ignore */ }
      try { unlinkSync(jpegFile); } catch (e) { /* ignore */ }
      try { unlinkSync(invalidFile); } catch (e) { /* ignore */ }
      try { rmdirSync(testDir); } catch (e) { /* ignore */ }
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
      try { mkdirSync(testDir, { recursive: true }); } catch (e) { /* ignore */ }

      // Create small file (1KB)
      writeFileSync(smallFile, Buffer.from([0x89, 0x50, 0x4E, 0x47, ...new Array(1000).fill(0)]));

      // Create large file (2MB)
      writeFileSync(largeFile, Buffer.from([0x89, 0x50, 0x4E, 0x47, ...new Array(2 * 1024 * 1024).fill(0)]));
    });

    afterAll(() => {
      try { unlinkSync(smallFile); } catch (e) { /* ignore */ }
      try { unlinkSync(largeFile); } catch (e) { /* ignore */ }
      try { rmdirSync(testDir); } catch (e) { /* ignore */ }
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

describe('File I/O Operations', () => {
  const testDir = join(process.cwd(), 'test-temp-io');

  beforeAll(() => {
    try { mkdirSync(testDir, { recursive: true }); } catch (e) { /* ignore */ }
  });

  afterAll(() => {
    try {
      // Clean up test files
      const files = readdirSync(testDir);
      files.forEach(file => unlinkSync(join(testDir, file)));
      rmdirSync(testDir);
    } catch (e) { /* ignore */ }
  });

  describe('ensureDirectory', () => {
    it('should create directory if it does not exist', async () => {
      const newDir = join(testDir, 'new-directory');
      await ensureDirectory(newDir);

      expect(existsSync(newDir)).toBe(true);

      // Cleanup
      rmdirSync(newDir);
    });

    it('should not throw if directory already exists', async () => {
      await expect(ensureDirectory(testDir)).resolves.not.toThrow();
    });

    it('should create nested directories', async () => {
      const nestedDir = join(testDir, 'level1', 'level2', 'level3');
      await ensureDirectory(nestedDir);

      expect(existsSync(nestedDir)).toBe(true);

      // Cleanup
      rmdirSync(join(testDir, 'level1', 'level2', 'level3'));
      rmdirSync(join(testDir, 'level1', 'level2'));
      rmdirSync(join(testDir, 'level1'));
    });
  });

  describe('writeToFile and readFromFile', () => {
    it('should write and read JSON files', async () => {
      const filepath = join(testDir, 'test.json');
      const data = { key: 'value', number: 42, nested: { prop: 'test' } };

      await writeToFile(data, filepath, 'json');
      const result = await readFromFile(filepath, 'json');

      expect(result).toEqual(data);
      unlinkSync(filepath);
    });

    it('should write and read text files', async () => {
      const filepath = join(testDir, 'test.txt');
      const data = 'Hello, World!\nThis is a test.';

      await writeToFile(data, filepath, 'text');
      const result = await readFromFile(filepath, 'text');

      expect(result).toBe(data);
      unlinkSync(filepath);
    });

    it('should write and read binary files', async () => {
      const filepath = join(testDir, 'test.bin');
      const data = Buffer.from([0x89, 0x50, 0x4E, 0x47]);

      await writeToFile(data, filepath, 'binary');
      const result = await readFromFile(filepath, 'binary');

      expect(result).toEqual(data);
      unlinkSync(filepath);
    });

    it('should auto-detect JSON format', async () => {
      const filepath = join(testDir, 'auto.json');
      const data = { test: 'auto-detect' };

      await writeToFile(data, filepath); // No format specified
      const result = await readFromFile(filepath); // No format specified

      expect(result).toEqual(data);
      unlinkSync(filepath);
    });

    it('should auto-detect text format', async () => {
      const filepath = join(testDir, 'auto.txt');
      const data = 'Auto-detect text';

      await writeToFile(data, filepath);
      const result = await readFromFile(filepath);

      expect(result).toBe(data);
      unlinkSync(filepath);
    });

    it('should create parent directories if they do not exist', async () => {
      const filepath = join(testDir, 'nested', 'deep', 'file.json');
      const data = { nested: true };

      await writeToFile(data, filepath, 'json');
      const result = await readFromFile(filepath, 'json');

      expect(result).toEqual(data);

      // Cleanup
      unlinkSync(filepath);
      rmdirSync(join(testDir, 'nested', 'deep'));
      rmdirSync(join(testDir, 'nested'));
    });
  });
});

describe('Image Conversion', () => {
  const testDir = join(process.cwd(), 'test-temp-images');
  const pngFile = join(testDir, 'test.png');
  const jpegFile = join(testDir, 'test.jpg');

  beforeAll(() => {
    try { mkdirSync(testDir, { recursive: true }); } catch (e) { /* ignore */ }

    // Create valid PNG file
    writeFileSync(pngFile, Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...new Array(100).fill(0)]));

    // Create valid JPEG file
    writeFileSync(jpegFile, Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...new Array(100).fill(0)]));
  });

  afterAll(() => {
    try {
      unlinkSync(pngFile);
      unlinkSync(jpegFile);
      rmdirSync(testDir);
    } catch (e) { /* ignore */ }
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fileToBase64', () => {
    it('should convert PNG file to base64', async () => {
      const result = await fileToBase64(pngFile);

      // Should return raw base64 string (not data URI)
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(100);
      // PNG files start with "iVBORw0KGgo" in base64
      expect(result).toMatch(/^iVBORw0KGgo/);
    });

    it('should convert JPEG file to base64', async () => {
      const result = await fileToBase64(jpegFile);

      // Should return raw base64 string (not data URI)
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(100);
      // JPEG files start with "/9j/" in base64
      expect(result).toMatch(/^\/9j\//);
    });

    it('should throw error for non-existent file', async () => {
      await expect(
        fileToBase64('/nonexistent/file.jpg')
      ).rejects.toThrow();
    });
  });

  describe('urlToBase64', () => {
    beforeEach(() => {
      // Mock DNS to return public IP for URL tests
      mockedLookup.mockResolvedValue({ address: '8.8.8.8', family: 4 });
    });

    it('should download and convert image from URL to base64', async () => {
      const mockImageBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...new Array(100).fill(0)]);

      mockedAxios.get.mockResolvedValue({
        data: mockImageBuffer,
        headers: { 'content-type': 'image/jpeg', 'content-length': '104' }
      });

      const result = await urlToBase64('https://example.com/image.jpg');

      // Should return raw base64 string (not data URI)
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\/9j\//); // JPEG signature in base64
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://example.com/image.jpg',
        expect.objectContaining({
          responseType: 'arraybuffer',
          timeout: 60000,
          maxRedirects: 5
        })
      );
    });

    it('should reject files exceeding size limit', async () => {
      const largeBuffer = Buffer.alloc(51 * 1024 * 1024); // 51MB

      mockedAxios.get.mockResolvedValue({
        data: largeBuffer,
        headers: { 'content-type': 'image/jpeg' }
      });

      await expect(
        urlToBase64('https://example.com/large.jpg')
      ).rejects.toThrow('exceeds maximum size');
    });

    it('should handle download timeout', async () => {
      mockedAxios.get.mockRejectedValue({ code: 'ETIMEDOUT', message: 'timeout' });

      await expect(
        urlToBase64('https://example.com/slow.jpg')
      ).rejects.toThrow();
    });

    it('should reject HTTP URLs (require HTTPS)', async () => {
      await expect(
        urlToBase64('http://example.com/image.jpg')
      ).rejects.toThrow(); // Will throw during validation
    });
  });

  describe('imageToBase64', () => {
    beforeEach(() => {
      mockedLookup.mockResolvedValue({ address: '8.8.8.8', family: 4 });
    });

    it('should handle local file paths', async () => {
      const result = await imageToBase64(pngFile);

      // Should return raw base64 string (not data URI)
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^iVBORw0KGgo/); // PNG signature
    });

    it('should handle URLs', async () => {
      const mockImageBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...new Array(100).fill(0)]);

      mockedAxios.get.mockResolvedValue({
        data: mockImageBuffer,
        headers: { 'content-type': 'image/png', 'content-length': '108' }
      });

      const result = await imageToBase64('https://example.com/image.png');

      // Should return raw base64 string (not data URI)
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^iVBORw0KGgo/); // PNG signature
    });

    it('should detect and route file paths correctly', async () => {
      const result = await imageToBase64(jpegFile);

      // Should return raw base64 string
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\/9j\//); // JPEG signature
    });

    it('should detect and route URLs correctly', async () => {
      const mockBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...new Array(50).fill(0)]);

      mockedAxios.get.mockResolvedValue({
        data: mockBuffer,
        headers: { 'content-type': 'image/jpeg', 'content-length': '54' }
      });

      const result = await imageToBase64('https://cdn.example.com/photo.jpg');

      // Should return raw base64 string
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\/9j\//); // JPEG signature
      expect(mockedAxios.get).toHaveBeenCalled();
    });
  });

  describe('downloadImage', () => {
    beforeEach(() => {
      mockedLookup.mockResolvedValue({ address: '8.8.8.8', family: 4 });
    });

    it('should download image and save to file', async () => {
      const mockBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...new Array(100).fill(0)]);
      const outputFile = join(testDir, 'downloaded.png');

      mockedAxios.get.mockResolvedValue({
        data: mockBuffer,
        headers: { 'content-type': 'image/png', 'content-length': '108' }
      });

      await downloadImage('https://example.com/image.png', outputFile);

      expect(existsSync(outputFile)).toBe(true);

      // Cleanup
      unlinkSync(outputFile);
    });

    it('should create parent directories if needed', async () => {
      const mockBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      const outputFile = join(testDir, 'nested', 'dir', 'image.jpg');

      mockedAxios.get.mockResolvedValue({
        data: mockBuffer,
        headers: { 'content-type': 'image/jpeg', 'content-length': '4' }
      });

      await downloadImage('https://example.com/image.jpg', outputFile);

      expect(existsSync(outputFile)).toBe(true);

      // Cleanup
      unlinkSync(outputFile);
      rmdirSync(join(testDir, 'nested', 'dir'));
      rmdirSync(join(testDir, 'nested'));
    });

    it('should reject downloads exceeding size limit', async () => {
      const largeBuffer = Buffer.alloc(51 * 1024 * 1024);

      mockedAxios.get.mockResolvedValue({
        data: largeBuffer,
        headers: { 'content-type': 'image/jpeg' }
      });

      await expect(
        downloadImage('https://example.com/large.jpg', join(testDir, 'large.jpg'))
      ).rejects.toThrow('exceeds maximum size');
    });
  });
});

describe('Utility Helpers', () => {
  describe('pause', () => {
    it('should pause for specified duration', async () => {
      const start = Date.now();
      await pause(0.1); // 100ms
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow 10ms margin
      expect(elapsed).toBeLessThan(150);
    });

    it('should work with fractional seconds', async () => {
      const start = Date.now();
      await pause(0.05); // 50ms
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(40);
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('randomNumber', () => {
    it('should generate number within range', () => {
      for (let i = 0; i < 100; i++) {
        const result = randomNumber(1, 10);
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(10);
      }
    });

    it('should generate integers', () => {
      for (let i = 0; i < 50; i++) {
        const result = randomNumber(1, 100);
        expect(Number.isInteger(result)).toBe(true);
      }
    });

    it('should handle min === max', () => {
      const result = randomNumber(5, 5);
      expect(result).toBe(5);
    });

    it('should work with large ranges', () => {
      const result = randomNumber(0, 1000000);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1000000);
    });
  });
});
