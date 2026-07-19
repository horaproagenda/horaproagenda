import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MAX_PHOTO_BYTES,
  getSafeExtension,
  getSafeContentType,
  validatePhotoFile,
  uploadOriginalPhoto,
} from '@/lib/photoUpload';

const uploadMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: () => ({ upload: uploadMock }),
    },
  },
}));

function makeFile(name: string, type: string, size = 1024): File {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

beforeEach(() => {
  uploadMock.mockReset();
  uploadMock.mockResolvedValue({ data: { path: 'ok' }, error: null });
});

describe('photoUpload — regression guard for original-fidelity uploads', () => {
  it('preserves extension from filename', () => {
    expect(getSafeExtension(makeFile('foto.HEIC', 'image/heic'))).toBe('heic');
    expect(getSafeExtension(makeFile('a.jpeg', 'image/jpeg'))).toBe('jpeg');
  });

  it('falls back to extension from MIME when filename lacks one', () => {
    expect(getSafeExtension(makeFile('noext', 'image/png'))).toBe('png');
  });

  it('returns real MIME when provided', () => {
    expect(getSafeContentType(makeFile('a.jpg', 'image/jpeg'))).toBe('image/jpeg');
  });

  it('infers MIME from extension when file.type is empty (mobile HEIC)', () => {
    expect(getSafeContentType(makeFile('foto.heic', ''))).toBe('image/heic');
  });

  it('accepts modern image formats', () => {
    for (const [name, type] of [
      ['a.jpg', 'image/jpeg'],
      ['a.png', 'image/png'],
      ['a.webp', 'image/webp'],
      ['a.heic', 'image/heic'],
      ['a.avif', 'image/avif'],
    ] as const) {
      expect(validatePhotoFile(makeFile(name, type)).ok).toBe(true);
    }
  });

  it('rejects non-images and empty files', () => {
    expect(validatePhotoFile(makeFile('a.pdf', 'application/pdf')).ok).toBe(false);
    expect(validatePhotoFile(makeFile('a.jpg', 'image/jpeg', 0)).ok).toBe(false);
  });

  it('rejects files above MAX_PHOTO_BYTES', () => {
    const big = makeFile('a.jpg', 'image/jpeg', MAX_PHOTO_BYTES + 1);
    expect(validatePhotoFile(big).ok).toBe(false);
  });

  it('uploads the ORIGINAL File instance untouched (no resize/re-encode)', async () => {
    const file = makeFile('foto.jpg', 'image/jpeg', 2048);
    await uploadOriginalPhoto({ bucket: 'avatars', path: 'u/x.jpg', file });
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [path, body, opts] = uploadMock.mock.calls[0];
    expect(path).toBe('u/x.jpg');
    // The exact same File instance must reach storage — no canvas/toBlob wrapper.
    expect(body).toBe(file);
    expect(opts.contentType).toBe('image/jpeg');
    expect(opts.cacheControl).toBe('31536000');
    expect(opts.upsert).toBe(true);
  });

  it('throws when storage returns an error', async () => {
    uploadMock.mockResolvedValueOnce({ data: null, error: new Error('boom') });
    await expect(
      uploadOriginalPhoto({ bucket: 'avatars', path: 'x', file: makeFile('a.jpg', 'image/jpeg') }),
    ).rejects.toThrow('boom');
  });
});
