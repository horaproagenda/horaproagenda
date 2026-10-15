import { describe, it, expect, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { resolvePhotoPath } from '@/hooks/useSignedPhotoUrl';

describe('resolvePhotoPath', () => {
  it('extracts path from legacy public URL when file_path is missing', () => {
    expect(resolvePhotoPath({ file_path: null, file_url: 'https://x.supabase.co/storage/v1/object/public/client-photos/abc/1.jpg' })).toBe('abc/1.jpg');
  });
  it('strips bucket prefix from file_path', () => {
    expect(resolvePhotoPath({ file_path: 'client-photos/abc/2.jpg', file_url: null })).toBe('abc/2.jpg');
  });
});
