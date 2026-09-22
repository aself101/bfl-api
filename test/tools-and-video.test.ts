/**
 * Tests for the endpoints added in 2.0: FLUX 1.1 Ultra finetune, FLUX.2 [max]
 * and [klein], the FLUX Tools image endpoints, FLUX 3 video, and the finetune
 * utilities. Each test asserts on the exact payload the wrapper sends, because
 * several of these schemas are strict (`additionalProperties: false`) and an
 * extra key is a 422.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { httpCalls, installHttpMock, resetHttpMock } from './helpers/http-mock.js';
import { BflAPI } from '../src/api.js';


/** The JSON body of the most recent POST. */
function lastPayload(): Record<string, unknown> {
  const calls = httpCalls.post.mock.calls;
  return calls[calls.length - 1][1] as Record<string, unknown>;
}

/** The URL of the most recent POST. */
function lastUrl(): string {
  const calls = httpCalls.post.mock.calls;
  return calls[calls.length - 1][0] as string;
}

// Re-install the fetch double before every test: afterEach hooks below call
// vi.resetAllMocks(), which strips mock implementations.
beforeEach(() => {
  installHttpMock();
  resetHttpMock();
});

describe('BflAPI 2.0 endpoints', () => {
  let api: BflAPI;

  beforeAll(() => {
    api = new BflAPI({ apiKey: 'test_api_key_for_unit_tests', logLevel: 'NONE' });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    httpCalls.post.mockResolvedValue({ data: { id: 'task_123', polling_url: 'https://api.bfl.ai/v1/get_result?id=task_123' } });
    httpCalls.get.mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ==================== FLUX 1.1 [pro] Ultra finetune ====================

  describe('generateFluxProUltraFinetuned', () => {
    it('posts to the ultra-finetuned endpoint with the finetune pair', async () => {
      await api.generateFluxProUltraFinetuned({
        finetune_id: 'ft-1',
        prompt: 'brand shot',
        finetune_strength: 1.4,
        aspect_ratio: '1:1',
      });
      expect(lastUrl()).toContain('/v1/flux-pro-1.1-ultra-finetuned');
      expect(lastPayload()).toEqual({
        finetune_id: 'ft-1',
        prompt: 'brand shot',
        finetune_strength: 1.4,
        aspect_ratio: '1:1',
      });
    });

    it('requires finetune_id', async () => {
      await expect(
        api.generateFluxProUltraFinetuned({ prompt: 'x' } as never)
      ).rejects.toThrow('finetune_id is required');
      expect(httpCalls.post).not.toHaveBeenCalled();
    });
  });

  // ==================== FLUX.2 [max] / [klein] ====================

  describe('generateFlux2Max', () => {
    it('uses the Flux2Inputs shape (disable_pup, 8 image slots)', async () => {
      await api.generateFlux2Max({
        prompt: 'p',
        disable_pup: true,
        input_image: 'a',
        input_image_8: 'h',
      });
      expect(lastUrl()).toContain('/v1/flux-2-max');
      expect(lastPayload()).toEqual({ prompt: 'p', disable_pup: true, input_image: 'a', input_image_8: 'h' });
    });
  });

  describe('generateFlux2Klein4b / 9b', () => {
    it('posts to the 4B and 9B endpoints respectively', async () => {
      await api.generateFlux2Klein4b({ prompt: 'p' });
      expect(lastUrl()).toContain('/v1/flux-2-klein-4b');
      await api.generateFlux2Klein9b({ prompt: 'p' });
      expect(lastUrl()).toContain('/v1/flux-2-klein-9b');
    });

    it('sends at most four input images and no upsampling control', async () => {
      await api.generateFlux2Klein9b({
        prompt: 'p',
        input_image: 'a',
        input_image_4: 'd',
        // Not on Flux2KleinInputs; must not leak through even if a caller forces it.
        ...({ input_image_5: 'e', disable_pup: true, prompt_upsampling: true } as object),
      } as never);
      const payload = lastPayload();
      expect(payload).toEqual({ prompt: 'p', input_image: 'a', input_image_4: 'd' });
    });
  });

  // ==================== FLUX Tools (image) ====================

  describe('deblurImage', () => {
    it('sends only the image plus optional fields — no prompt', async () => {
      await api.deblurImage({ image: 'img', seed: 7, output_format: 'png', user: 'u1' });
      expect(lastUrl()).toContain('/v1/flux-tools/deblur-v1');
      expect(lastPayload()).toEqual({ image: 'img', seed: 7, output_format: 'png', user: 'u1' });
    });

    it('requires image', async () => {
      await expect(api.deblurImage({} as never)).rejects.toThrow('image is required');
    });
  });

  describe('eraseImage', () => {
    it('sends image, mask and dilate_pixels', async () => {
      await api.eraseImage({ image: 'img', mask: 'm', dilate_pixels: 0 });
      expect(lastUrl()).toContain('/v1/flux-tools/erase-v1');
      // dilate_pixels: 0 is a legitimate value and must be sent
      expect(lastPayload()).toEqual({ image: 'img', mask: 'm', dilate_pixels: 0 });
    });

    it('requires image and mask', async () => {
      await expect(api.eraseImage({ mask: 'm' } as never)).rejects.toThrow('image is required');
      await expect(api.eraseImage({ image: 'i' } as never)).rejects.toThrow('mask is required');
    });
  });

  describe('outpaintImage', () => {
    it('sends canvas size, offsets and mode; negative offsets are allowed', async () => {
      await api.outpaintImage({
        input_image: 'img',
        width: 2048,
        height: 1024,
        reference_offset_x: -40,
        reference_offset_y: 0,
        mode: 'fast',
        auto_crop: false,
        disable_pup: true,
        prompt: 'extend',
      });
      expect(lastUrl()).toContain('/v1/flux-tools/outpainting-v1');
      expect(lastPayload()).toEqual({
        input_image: 'img',
        width: 2048,
        height: 1024,
        reference_offset_x: -40,
        reference_offset_y: 0,
        mode: 'fast',
        auto_crop: false,
        disable_pup: true,
        prompt: 'extend',
      });
    });

    it('does not send fields the strict schema lacks (seed, webhooks)', async () => {
      await api.outpaintImage({
        input_image: 'img',
        width: 512,
        height: 512,
        ...({ seed: 1, webhook_url: 'https://x', top: 10 } as object),
      } as never);
      expect(lastPayload()).toEqual({ input_image: 'img', width: 512, height: 512 });
    });

    it('requires input_image, width and height', async () => {
      await expect(api.outpaintImage({ width: 1, height: 1 } as never)).rejects.toThrow('input_image is required');
      await expect(api.outpaintImage({ input_image: 'i', width: 1 } as never)).rejects.toThrow(
        'width and height are required'
      );
    });
  });

  describe('virtualTryOn', () => {
    it('sends prompt, person and garment', async () => {
      await api.virtualTryOn({ prompt: 'TRY-ON', person: 'p', garment: 'g', seed: 3 });
      expect(lastUrl()).toContain('/v1/flux-tools/vto-v2');
      expect(lastPayload()).toEqual({ prompt: 'TRY-ON', person: 'p', garment: 'g', seed: 3 });
    });

    it('requires person, garment and prompt', async () => {
      await expect(api.virtualTryOn({ prompt: 'x', garment: 'g' } as never)).rejects.toThrow('person is required');
      await expect(api.virtualTryOn({ prompt: 'x', person: 'p' } as never)).rejects.toThrow('garment is required');
      await expect(api.virtualTryOn({ person: 'p', garment: 'g' } as never)).rejects.toThrow('prompt is required');
    });
  });

  // ==================== FLUX 3 video ====================

  describe('generateFlux3Video', () => {
    it('t2v: sends mode, prompt and the generation controls', async () => {
      await api.generateFlux3Video({
        mode: 't2v',
        prompt: 'a fox',
        duration: 8,
        resolution: 'fhd',
        aspect_ratio: '16:9',
        generate_audio: false,
        draft: true,
        safety_tolerance: 1,
      });
      expect(lastUrl()).toContain('/v1/flux-3-video');
      expect(lastPayload()).toEqual({
        mode: 't2v',
        prompt: 'a fox',
        duration: 8,
        resolution: 'fhd',
        aspect_ratio: '16:9',
        generate_audio: false,
        draft: true,
        safety_tolerance: 1,
      });
    });

    it('accepts duration "auto"', async () => {
      await api.generateFlux3Video({ mode: 't2v', prompt: 'p', duration: 'auto' });
      expect(lastPayload().duration).toBe('auto');
    });

    it('i2v: sends keyframes in both plain and timed forms', async () => {
      await api.generateFlux3Video({ mode: 'i2v', prompt: 'p', keyframes: 'img' });
      expect(lastPayload()).toEqual({ mode: 'i2v', prompt: 'p', keyframes: 'img' });

      await api.generateFlux3Video({
        mode: 'i2v',
        prompt: 'p',
        keyframes: [
          [0, 'a'],
          [3.5, 'b'],
        ],
      });
      expect(lastPayload().keyframes).toEqual([
        [0, 'a'],
        [3.5, 'b'],
      ]);
    });

    it('i2v: requires keyframes', async () => {
      await expect(api.generateFlux3Video({ mode: 'i2v', prompt: 'p' } as never)).rejects.toThrow(
        'keyframes is required'
      );
      await expect(
        api.generateFlux3Video({ mode: 'i2v', prompt: 'p', keyframes: [] })
      ).rejects.toThrow('keyframes is required');
    });

    it('v2v: sends start_video and requires it', async () => {
      await api.generateFlux3Video({ mode: 'v2v', prompt: 'p', start_video: 'vid', duration: 10 });
      expect(lastPayload()).toEqual({ mode: 'v2v', prompt: 'p', start_video: 'vid', duration: 10 });
      await expect(api.generateFlux3Video({ mode: 'v2v', prompt: 'p' } as never)).rejects.toThrow(
        'start_video is required'
      );
    });

    it('draft_enhance: sends only mode, draft_cache, resolution, safety_tolerance, user', async () => {
      await api.generateFlux3Video({
        mode: 'draft_enhance',
        draft_cache: 'bin',
        resolution: 'qhd',
        user: 'u',
        // prompt/duration are not on this schema; a caller forcing them must not leak
        ...({ prompt: 'nope', duration: 5, generate_audio: true } as object),
      } as never);
      expect(lastPayload()).toEqual({ mode: 'draft_enhance', draft_cache: 'bin', resolution: 'qhd', user: 'u' });
    });

    it('draft_enhance: requires draft_cache', async () => {
      await expect(api.generateFlux3Video({ mode: 'draft_enhance' } as never)).rejects.toThrow(
        'draft_cache is required'
      );
    });

    it('never sends seed, output_format or webhook fields (strict schema)', async () => {
      await api.generateFlux3Video({
        mode: 't2v',
        prompt: 'p',
        ...({ seed: 1, output_format: 'png', webhook_url: 'https://x' } as object),
      } as never);
      expect(lastPayload()).toEqual({ mode: 't2v', prompt: 'p' });
    });

    it('rejects an unknown mode before submitting', async () => {
      await expect(api.generateFlux3Video({ mode: 'text-to-video', prompt: 'p' } as never)).rejects.toThrow(
        'Unknown FLUX 3 Video mode: text-to-video'
      );
      expect(httpCalls.post).not.toHaveBeenCalled();
    });

    it('requires a prompt for generating modes', async () => {
      await expect(api.generateFlux3Video({ mode: 't2v' } as never)).rejects.toThrow('prompt is required');
    });
  });

  describe('editVideo', () => {
    it('sends exactly video, prompt, safety_tolerance and user', async () => {
      await api.editVideo({
        video: 'vid',
        prompt: 'make it snow',
        safety_tolerance: 3,
        user: 'u',
        ...({ seed: 1, mode: 't2v', webhook_url: 'https://x' } as object),
      } as never);
      expect(lastUrl()).toContain('/v1/flux-tools/video-edit-v1');
      expect(lastPayload()).toEqual({ video: 'vid', prompt: 'make it snow', safety_tolerance: 3, user: 'u' });
    });

    it('requires video and a non-blank prompt', async () => {
      await expect(api.editVideo({ prompt: 'x' } as never)).rejects.toThrow('video is required');
      await expect(api.editVideo({ video: 'v', prompt: '   ' })).rejects.toThrow('prompt is required');
    });
  });

  describe('upscaleVideo', () => {
    it('sends input_video and the upscale controls', async () => {
      await api.upscaleVideo({
        input_video: 'vid',
        prompt: '',
        creativity: 0,
        upscale_factor: 2.5,
        webhook_url: 'https://example.com/hook',
      });
      expect(lastUrl()).toContain('/v1/flux-tools/video-upscale-v1');
      // creativity: 0 and prompt: '' are both meaningful values and must be sent
      expect(lastPayload()).toEqual({
        input_video: 'vid',
        prompt: '',
        creativity: 0,
        upscale_factor: 2.5,
        webhook_url: 'https://example.com/hook',
      });
    });

    it('requires input_video', async () => {
      await expect(api.upscaleVideo({} as never)).rejects.toThrow('input_video is required');
    });
  });

  // ==================== Common request fields ====================

  describe('common request fields', () => {
    it('forwards user / webhook_url / webhook_secret on every image method that has them', async () => {
      const common = { user: 'u', webhook_url: 'https://example.com/h', webhook_secret: 's' };
      const calls: Array<() => Promise<unknown>> = [
        () => api.generateFluxDev({ prompt: 'p', ...common }),
        () => api.generateFluxPro({ prompt: 'p', ...common }),
        () => api.generateFluxProUltra({ prompt: 'p', ...common }),
        () => api.generateFluxProFill({ prompt: 'p', image: 'i', ...common }),
        () => api.generateFluxProExpand({ image: 'i', ...common }),
        () => api.generateKontextPro({ prompt: 'p', ...common }),
        () => api.generateFlux2Pro({ prompt: 'p', ...common }),
        () => api.generateFlux2Flex({ prompt: 'p', ...common }),
        () => api.generateFlux2Klein4b({ prompt: 'p', ...common }),
        () => api.deblurImage({ image: 'i', ...common }),
        () => api.eraseImage({ image: 'i', mask: 'm', ...common }),
        () => api.virtualTryOn({ prompt: 'p', person: 'a', garment: 'b', ...common }),
        () => api.upscaleVideo({ input_video: 'v', ...common }),
      ];
      for (const call of calls) {
        await call();
        expect(lastPayload()).toMatchObject(common);
      }
      expect(httpCalls.post).toHaveBeenCalledTimes(calls.length);
    });

    it('never sends undefined-valued keys', async () => {
      await api.generateFluxDev({ prompt: 'p', seed: undefined, user: undefined });
      expect(Object.keys(lastPayload()).sort()).toEqual(['guidance', 'height', 'prompt', 'steps', 'width']);
    });
  });

  // ==================== Finetune utilities ====================

  describe('getFinetuneDetails', () => {
    it('GETs finetune_details with the id URL-encoded', async () => {
      httpCalls.get.mockResolvedValue({ data: { finetune_details: { mode: 'general' } } });
      const result = await api.getFinetuneDetails('my ft/1');
      expect(httpCalls.get).toHaveBeenCalledWith(
        expect.stringContaining('/v1/finetune_details?finetune_id=my%20ft%2F1'),
        expect.any(Object)
      );
      expect(result.finetune_details.mode).toBe('general');
    });

    it('requires an id', async () => {
      await expect(api.getFinetuneDetails('')).rejects.toThrow('finetuneId is required');
    });
  });

  describe('deleteFinetune', () => {
    it('POSTs delete_finetune with the id in the body', async () => {
      httpCalls.post.mockResolvedValue({
        data: { status: 'success', message: 'deleted', deleted_finetune_id: 'ft-1', timestamp: 't' },
      });
      const result = await api.deleteFinetune('ft-1');
      expect(lastUrl()).toContain('/v1/delete_finetune');
      expect(lastPayload()).toEqual({ finetune_id: 'ft-1' });
      expect(result.deleted_finetune_id).toBe('ft-1');
    });

    it('requires an id', async () => {
      await expect(api.deleteFinetune('')).rejects.toThrow('finetuneId is required');
      expect(httpCalls.post).not.toHaveBeenCalled();
    });
  });
});
