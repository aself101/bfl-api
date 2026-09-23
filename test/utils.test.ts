/**
 * Utility Functions Tests
 * Tests for file I/O, image conversion, and filename generation utilities
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { httpCalls, installHttpMock, resetHttpMock } from './helpers/http-mock.js';
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
  validateVideoPath,
  videoToBase64,
  downloadVideo,
  downloadMedia,
  createGuardedLookup,
  type AllAddressResolver,
  MAX_VIDEO_UPLOAD_BYTES,
  pause,
  randomNumber
} from '../src/utils.js';
import { validateApiKeyFormat } from '../src/config.js';
import { lookup } from 'dns/promises';
import type { LookupAddress } from 'dns';
import { Agent } from 'undici';


// validateImageUrl calls lookup(host, { all: true }), which resolves to an
// array; vi.mocked() picks the single-address overload, so the mock is typed
// once here for the all-addresses form rather than cast at every call site.
const mockedLookup = vi.mocked(lookup) as unknown as Mock<
  (hostname: string, options: { all: true }) => Promise<LookupAddress[]>
>;

// Re-install the fetch double before every test: afterEach hooks below call
// vi.resetAllMocks(), which strips mock implementations.
beforeEach(() => {
  installHttpMock();
  resetHttpMock();
});

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
      mockedLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
      await expect(validateImageUrl('https://example.com/image.jpg')).resolves.toBe('https://example.com/image.jpg');

      mockedLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
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
      mockedLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
      await expect(validateImageUrl('https://evil.com/image.jpg')).rejects.toThrow('resolves to internal/private IP');
    });

    it('should reject domains resolving to private IPs (DNS rebinding prevention)', async () => {
      // Test 10.x.x.x
      mockedLookup.mockResolvedValue([{ address: '10.0.0.1', family: 4 }]);
      await expect(validateImageUrl('https://evil.com/image.jpg')).rejects.toThrow('resolves to internal/private IP');

      // Test 192.168.x.x
      mockedLookup.mockResolvedValue([{ address: '192.168.1.1', family: 4 }]);
      await expect(validateImageUrl('https://evil2.com/image.jpg')).rejects.toThrow('resolves to internal/private IP');

      // Test 172.16-31.x.x
      mockedLookup.mockResolvedValue([{ address: '172.16.0.1', family: 4 }]);
      await expect(validateImageUrl('https://evil3.com/image.jpg')).rejects.toThrow('resolves to internal/private IP');
    });

    it('should reject domains resolving to cloud metadata IPs (DNS rebinding prevention)', async () => {
      mockedLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
      await expect(validateImageUrl('https://evil.com/image.jpg')).rejects.toThrow('resolves to internal/private IP');
    });

    it('should reject domains resolving to IPv6 loopback (DNS rebinding prevention)', async () => {
      mockedLookup.mockResolvedValue([{ address: '::1', family: 6 }]);
      await expect(validateImageUrl('https://evil.com/image.jpg')).rejects.toThrow('resolves to internal/private IP');
    });

    it('should reject domains resolving to IPv6 private addresses (DNS rebinding prevention)', async () => {
      // Test fe80: (link-local)
      mockedLookup.mockResolvedValue([{ address: 'fe80::1', family: 6 }]);
      await expect(validateImageUrl('https://evil.com/image.jpg')).rejects.toThrow('resolves to internal/private IP');

      // Test fc00: (unique local)
      mockedLookup.mockResolvedValue([{ address: 'fc00::1', family: 6 }]);
      await expect(validateImageUrl('https://evil2.com/image.jpg')).rejects.toThrow('resolves to internal/private IP');
    });

    it('should check every resolved address, not just the first', async () => {
      mockedLookup.mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.1', family: 4 },
      ]);
      await expect(validateImageUrl('https://mixed.example/image.jpg')).rejects.toThrow('resolves to internal/private IP');
      expect(mockedLookup).toHaveBeenLastCalledWith('mixed.example', { all: true });
    });

    it('should reject the whole fc00::/7 unique-local range, not just the fc00:/fd00: literals', async () => {
      for (const address of ['fd12:3456:789a::1', 'fcff::1', 'FD00::1']) {
        mockedLookup.mockResolvedValue([{ address, family: 6 }]);
        await expect(validateImageUrl('https://evil.com/image.jpg'), address).rejects.toThrow('resolves to internal/private IP');
      }
    });

    it('should reject the whole fe80::/10 link-local range', async () => {
      for (const address of ['fe90::1', 'febf::1']) {
        mockedLookup.mockResolvedValue([{ address, family: 6 }]);
        await expect(validateImageUrl('https://evil.com/image.jpg'), address).rejects.toThrow('resolves to internal/private IP');
      }
    });

    it('should judge an IPv4-mapped IPv6 answer by its embedded IPv4', async () => {
      mockedLookup.mockResolvedValue([{ address: '::ffff:10.0.0.1', family: 6 }]);
      await expect(validateImageUrl('https://evil.com/image.jpg')).rejects.toThrow('resolves to internal/private IP');
    });

    it('should not over-block: short hextets and public IPv6 pass', async () => {
      // fd1:: is 0x0fd1 (implied leading zero) — not ULA. 2606:... is public.
      for (const address of ['fd1::1', 'fe8::1', '2606:4700::6810:84e5', '::ffff:93.184.216.34']) {
        mockedLookup.mockResolvedValue([{ address, family: 6 }]);
        await expect(validateImageUrl('https://ok.example/image.jpg'), address).resolves.toBe('https://ok.example/image.jpg');
      }
    });

    // Both edges of every IPv4 private range, plus the adjacent public
    // addresses: a range regex that drops its top end (e.g. 172.31.x.x)
    // passed stability-ai-api's suite until its ship run #3 mutated it.
    it.each([
      '10.0.0.0', '10.255.255.255', '172.16.0.0', '172.31.255.255', '192.168.0.0', '192.168.255.255',
      '169.254.0.1', '169.254.255.254', '100.64.0.0', '100.127.255.255', '127.255.255.254', '0.0.0.1',
    ])('blocks private/reserved edge %s', async (ip) => {
      await expect(validateImageUrl(`https://${ip}/x.png`)).rejects.toThrow(/internal|private|localhost/);
    });

    it.each(['9.255.255.255', '11.0.0.1', '172.15.255.255', '172.32.0.1', '192.167.255.255', '192.169.0.1', '100.63.255.255', '100.128.0.0', '223.255.255.254'])(
      'allows the adjacent public address %s', async (ip) => {
        await expect(validateImageUrl(`https://${ip}/x.png`)).resolves.toBe(`https://${ip}/x.png`);
      });

    // The hex spellings are what validateImageUrl sees after new URL() parsing:
    // https://[::ffff:127.0.0.1] becomes [::ffff:7f00:1]. Until 2.0.2 only the
    // dotted form was recognised, so the hex form of loopback got through
    // (found in stability-ai-api's ship pipeline; same code here).
    it.each([
      ['https://[::ffff:7f00:1]/x.png', 'IPv4-mapped loopback, hex'],
      ['https://[::ffff:a9fe:a9fe]/x.png', 'IPv4-mapped metadata, hex'],
      ['https://[64:ff9b::a9fe:a9fe]/x.png', 'NAT64 metadata'],
      ['https://[::ffff:0:a00:1]/x.png', 'IPv4-translated 10.0.0.1'],
      ['https://[::7f00:1]/x.png', 'IPv4-compatible loopback'],
      ['https://100.64.1.1/x.png', 'carrier-grade NAT'],
      ['https://198.18.0.1/x.png', 'benchmarking range'],
      ['https://[ff02::1]/x.png', 'IPv6 multicast'],
    ])('blocks %s (%s)', async (url) => {
      await expect(validateImageUrl(url)).rejects.toThrow(/internal|private|localhost/);
    });

    // 6to4 (2002::/16) carries an IPv4 in hextets 1-2; Teredo (2001::/32)
    // carries the client IPv4 bit-inverted in the last 32 bits. fec0::/10 is
    // deprecated site-local. All three passed 2.0.2's first cut (security-analyst).
    it.each([
      ['https://[2002:7f00:1::1]/x.png', '6to4 wrapping 127.0.0.1'],
      ['https://[2002:c0a8:101::1]/x.png', '6to4 wrapping 192.168.1.1'],
      ['https://[2002:a9fe:a9fe::1]/x.png', '6to4 wrapping metadata'],
      ['https://[2001:0:4136:e378:8000:63bf:f5ff:fffe]/x.png', 'Teredo, client 10.0.0.1'],
      ['https://[2001:0:4136:e378:8000:63bf:80ff:fffe]/x.png', 'Teredo, client 127.0.0.1'],
      ['https://[fec0::1]/x.png', 'site-local fec0::/10'],
      ['https://[feff::1]/x.png', 'site-local, top of fec0::/10'],
      ['https://[2001:db8::200:5efe:7f00:1]/x.png', 'ISATAP (global IID) wrapping 127.0.0.1'],
      ['https://[2001:db8::5efe:a00:1]/x.png', 'ISATAP (private IID) wrapping 10.0.0.1'],
    ])('blocks %s (%s)', async (url) => {
      await expect(validateImageUrl(url)).rejects.toThrow(/internal|private|localhost/);
    });

    it.each([
      'https://[2002:5db8:d822::1]/x.png',
      'https://[2001:0:4136:e378:8000:63bf:a247:27dd]/x.png',
      'https://[2001:db9::1]/x.png',
      'https://[2001:db8::200:5efe:5db8:d822]/x.png',
    ])('allows tunnel forms wrapping a public IPv4, and non-Teredo 2001:: %s', async (url) => {
      await expect(validateImageUrl(url)).resolves.toBe(url);
    });

    it.each(['https://100.128.0.1/x.png', 'https://[::ffff:5db8:d822]/x.png', 'https://[2606:4700::6810:84e5]/x.png'])(
      'allows public %s', async (url) => {
        await expect(validateImageUrl(url)).resolves.toBe(url);
      });

    it('judges a DNS answer in hex IPv4-mapped form by its IPv4', async () => {
      mockedLookup.mockResolvedValue([{ address: '::ffff:a00:1', family: 6 }]);
      await expect(validateImageUrl('https://evil.example/x.png')).rejects.toThrow('resolves to internal/private IP');
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
      mockedLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    });

    it('should download and convert image from URL to base64', async () => {
      const mockImageBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...new Array(100).fill(0)]);

      httpCalls.get.mockResolvedValue({
        data: mockImageBuffer,
        headers: { 'content-type': 'image/jpeg', 'content-length': '104' }
      });

      const result = await urlToBase64('https://example.com/image.jpg');

      // Should return raw base64 string (not data URI)
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\/9j\//); // JPEG signature in base64
      // Transport options (timeout, redirect budget, size cap) are internal to
      // src/http.ts now; see test/http.test.ts for their behaviour.
      expect(httpCalls.get).toHaveBeenCalledWith('https://example.com/image.jpg', expect.anything());
    });

    it('keeps a signed URL\'s query out of error messages', async () => {
      httpCalls.get.mockRejectedValue({ response: { status: 404, data: 'gone' } });
      const error = await urlToBase64('https://example.com/image.jpg?sig=SECRET-TOKEN').catch(e => e);
      expect(error.message).not.toContain('SECRET-TOKEN');
      expect(error.message).toContain('https://example.com/image.jpg?[redacted]');

      // A malformed URL must not smuggle its query through validateImageUrl's
      // "Invalid URL" message into an otherwise-redacted outer message.
      const malformed = 'https://bad host/p.png?sig=SECRET-TOKEN';
      const errors = [
        await validateImageUrl(malformed).catch(e => e),
        await urlToBase64(malformed).catch(e => e),
        await imageToBase64(malformed).catch(e => e),
        await downloadImage(malformed, '/tmp/never.png').catch(e => e),
      ];
      for (const e of errors) {
        expect(e).toBeInstanceOf(Error);
        expect(e.message).not.toContain('SECRET-TOKEN');
      }
    });

    it('URL-to-base64 downloads go through the connect-time SSRF guard dispatcher', async () => {
      httpCalls.get.mockResolvedValue({ data: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0]), headers: { 'content-type': 'image/jpeg' } });
      await urlToBase64('https://example.com/image.jpg');
      const dispatcher = httpCalls.get.mock.calls[0][1].dispatcher;
      expect(dispatcher).toBeInstanceOf(Agent);
      await urlToBase64('https://example.com/image.jpg');
      expect(httpCalls.get.mock.calls[1][1].dispatcher).toBe(dispatcher);
    });

    it('should reject files exceeding size limit', async () => {
      const largeBuffer = Buffer.alloc(51 * 1024 * 1024); // 51MB

      httpCalls.get.mockResolvedValue({
        data: largeBuffer,
        headers: { 'content-type': 'image/jpeg' }
      });

      await expect(
        urlToBase64('https://example.com/large.jpg')
      ).rejects.toThrow('exceeds maximum size');
    });

    it('should handle download timeout', async () => {
      httpCalls.get.mockRejectedValue({ code: 'ETIMEDOUT', message: 'timeout' });

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
      mockedLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    });

    it('should handle local file paths', async () => {
      const result = await imageToBase64(pngFile);

      // Should return raw base64 string (not data URI)
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^iVBORw0KGgo/); // PNG signature
    });

    it('should handle URLs', async () => {
      const mockImageBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...new Array(100).fill(0)]);

      httpCalls.get.mockResolvedValue({
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

      httpCalls.get.mockResolvedValue({
        data: mockBuffer,
        headers: { 'content-type': 'image/jpeg', 'content-length': '54' }
      });

      const result = await imageToBase64('https://cdn.example.com/photo.jpg');

      // Should return raw base64 string
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\/9j\//); // JPEG signature
      expect(httpCalls.get).toHaveBeenCalled();
    });
  });

  describe('downloadImage', () => {
    beforeEach(() => {
      mockedLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    });

    it('should download image and save to file', async () => {
      const mockBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...new Array(100).fill(0)]);
      const outputFile = join(testDir, 'downloaded.png');

      httpCalls.get.mockResolvedValue({
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

      httpCalls.get.mockResolvedValue({
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

      httpCalls.get.mockResolvedValue({
        data: largeBuffer,
        headers: { 'content-type': 'image/jpeg' }
      });

      await expect(
        downloadImage('https://example.com/large.jpg', join(testDir, 'large.jpg'))
      ).rejects.toThrow('exceeds maximum size');
    });
  });
});

describe('Video Inputs and Downloads', () => {
  const testDir = join(process.cwd(), 'test-temp-video');
  const mp4File = join(testDir, 'clip.mp4');
  const movFile = join(testDir, 'clip.mov');
  const notVideo = join(testDir, 'not-a-video.mp4');
  const emptyFile = join(testDir, 'empty.mp4');
  const ftyp = (brand: string): Buffer =>
    Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftyp'), Buffer.from(brand), Buffer.alloc(64)]);

  beforeAll(() => {
    try { mkdirSync(testDir, { recursive: true }); } catch (e) { /* ignore */ }
    writeFileSync(mp4File, ftyp('mp42'));
    writeFileSync(movFile, ftyp('qt  '));
    writeFileSync(notVideo, Buffer.from([0x89, 0x50, 0x4e, 0x47, ...new Array(100).fill(0)]));
    writeFileSync(emptyFile, Buffer.alloc(0));
    mockedLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  });

  afterAll(() => {
    for (const f of [mp4File, movFile, notVideo, emptyFile]) {
      try { unlinkSync(f); } catch (e) { /* ignore */ }
    }
    try { rmdirSync(testDir); } catch (e) { /* ignore */ }
  });

  describe('validateVideoPath', () => {
    it('accepts ISO BMFF files (mp4, mov)', async () => {
      await expect(validateVideoPath(mp4File)).resolves.toBe(mp4File);
      await expect(validateVideoPath(movFile)).resolves.toBe(movFile);
    });

    it('rejects files without an ftyp header regardless of extension', async () => {
      await expect(validateVideoPath(notVideo)).rejects.toThrow('does not appear to be an MP4 video');
    });

    it('rejects empty and missing files', async () => {
      await expect(validateVideoPath(emptyFile)).rejects.toThrow('empty');
      await expect(validateVideoPath(join(testDir, 'nope.mp4'))).rejects.toThrow('not found');
    });

    it('rejects files over the upload ceiling', async () => {
      const big = join(testDir, 'big.mp4');
      writeFileSync(big, Buffer.concat([ftyp('mp42'), Buffer.alloc(MAX_VIDEO_UPLOAD_BYTES)]));
      try {
        await expect(validateVideoPath(big)).rejects.toThrow('at most 50MB');
      } finally {
        unlinkSync(big);
      }
    });
  });

  describe('videoToBase64', () => {
    beforeEach(() => {
      httpCalls.get.mockClear();
    });

    it('base64-encodes a local file', async () => {
      const b64 = await videoToBase64(mp4File);
      expect(Buffer.from(b64, 'base64').subarray(4, 8).toString()).toBe('ftyp');
    });

    it('passes a validated URL through unchanged rather than embedding it', async () => {
      await expect(videoToBase64('https://example.com/clip.mp4')).resolves.toBe('https://example.com/clip.mp4');
      expect(httpCalls.get).not.toHaveBeenCalled();
    });

    it('applies SSRF protection to URLs', async () => {
      await expect(videoToBase64('http://localhost/clip.mp4')).rejects.toThrow();
    });
  });

  describe('downloadVideo / downloadMedia', () => {
    beforeEach(() => {
      mockedLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    });

    it('downloads a video with the larger ceiling', async () => {
      const out = join(testDir, 'out.mp4');
      httpCalls.get.mockResolvedValue({ data: ftyp('mp42'), headers: {} });
      await downloadVideo('https://example.com/v.mp4', out);
      expect(existsSync(out)).toBe(true);
      expect(httpCalls.get).toHaveBeenCalledWith('https://example.com/v.mp4', expect.anything());
      unlinkSync(out);
    });

    it('video downloads go through the connect-time SSRF guard dispatcher', async () => {
      const out = join(testDir, 'guarded.mp4');
      httpCalls.get.mockResolvedValue({ data: ftyp('mp42'), headers: {} });
      await downloadVideo('https://example.com/v.mp4', out);
      expect(httpCalls.get.mock.calls[0][1].dispatcher).toBeInstanceOf(Agent);
      unlinkSync(out);
    });

    it('downloadMedia honours a custom ceiling', async () => {
      httpCalls.get.mockResolvedValue({ data: Buffer.alloc(11), headers: {} });
      await expect(
        downloadMedia('https://example.com/v.mp4', join(testDir, 'tiny.mp4'), { maxSize: 10 })
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

describe('createGuardedLookup (connect-time SSRF guard)', () => {
  const resolver = (addresses: LookupAddress[] | undefined, err: NodeJS.ErrnoException | null = null): AllAddressResolver =>
    (_host, _opts, cb) => cb(err, addresses as LookupAddress[]);
  type Outcome = { err: NodeJS.ErrnoException | null; address: string | LookupAddress[]; family?: number };
  const run = (lookupFn: ReturnType<typeof createGuardedLookup>, options: object): Promise<Outcome> =>
    new Promise(resolve => lookupFn('cdn.example', options, (err, address, family) => resolve({ err, address, family })));

  it('passes every address through when all are public (all: true)', async () => {
    const addrs = [{ address: '93.184.216.34', family: 4 }, { address: '2606:2800:220:1::1', family: 6 }];
    const { err, address } = await run(createGuardedLookup(resolver(addrs)), { all: true });
    expect(err).toBeNull();
    expect(address).toEqual(addrs);
  });

  it('returns the first address and its family when all is not requested', async () => {
    const { err, address, family } = await run(createGuardedLookup(resolver([{ address: '93.184.216.34', family: 4 }])), {});
    expect(err).toBeNull();
    expect(address).toBe('93.184.216.34');
    expect(family).toBe(4);
  });

  it.each([
    ['one private among public', [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }]],
    ['loopback', [{ address: '127.0.0.1', family: 4 }]],
    ['cloud metadata', [{ address: '169.254.169.254', family: 4 }]],
    ['IPv6 unique-local', [{ address: 'fd12:3456::1', family: 6 }]],
    ['hex IPv4-mapped loopback', [{ address: '::ffff:7f00:1', family: 6 }]],
  ] as [string, LookupAddress[]][])('refuses with ESSRFBLOCKED: %s', async (_label, addrs) => {
    const { err } = await run(createGuardedLookup(resolver(addrs)), { all: true });
    expect(err?.code).toBe('ESSRFBLOCKED');
    expect(err?.message).toContain('resolves to internal/private IP address');
  });

  it('refuses an empty answer rather than handing undici nothing', async () => {
    const { err } = await run(createGuardedLookup(resolver([])), { all: true });
    expect(err?.code).toBe('ESSRFBLOCKED');
  });

  it('passes a resolver error through unchanged', async () => {
    const dnsError = Object.assign(new Error('getaddrinfo ENOTFOUND cdn.example'), { code: 'ENOTFOUND' });
    const { err } = await run(createGuardedLookup(resolver(undefined, dnsError)), { all: true });
    expect(err).toBe(dnsError);
  });

  it('always asks the resolver for every address, whatever the caller asked for', async () => {
    const seen: unknown[] = [];
    const spy: AllAddressResolver = (_host, opts, cb) => { seen.push(opts.all); cb(null, [{ address: '93.184.216.34', family: 4 }]); };
    await run(createGuardedLookup(spy), {});
    await run(createGuardedLookup(spy), { all: false });
    expect(seen).toEqual([true, true]);
  });
});
