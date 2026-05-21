import { describe, it, expect } from 'vitest';
import { buildClientStoragePath, assertClientStoragePath } from './clientUploadPath';

const CLIENT_ID = '04e58965-3851-4d45-8cae-42ddf14212fc';

describe('clientUploadPath', () => {
  it('builds a path whose first segment is the client UUID', () => {
    const path = buildClientStoragePath(CLIENT_ID, 'minha foto!.jpg');
    expect(path.split('/')[0]).toBe(CLIENT_ID);
    expect(path).toMatch(/minha_foto_\.jpg$/);
  });

  it('supports an optional subfolder while preserving the client prefix', () => {
    const path = buildClientStoragePath(CLIENT_ID, 'doc.pdf', 'documents');
    const [first, second] = path.split('/');
    expect(first).toBe(CLIENT_ID);
    expect(second).toBe('documents');
  });

  it('rejects invalid client UUIDs to avoid hitting Storage RLS at runtime', () => {
    expect(() => buildClientStoragePath('not-a-uuid', 'x.png')).toThrow();
  });

  it('assertClientStoragePath fails when the prefix does not match', () => {
    expect(() => assertClientStoragePath(CLIENT_ID, 'other/abc.jpg')).toThrow();
    expect(() => assertClientStoragePath(CLIENT_ID, `${CLIENT_ID}/photos/x.jpg`)).not.toThrow();
  });
});
