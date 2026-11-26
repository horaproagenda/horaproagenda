import { describe, expect, it, vi } from 'vitest';
import { purgeStorageFolders } from '../../../supabase/functions/_shared/storagePurge';

describe('limpeza de pastas no Storage API', () => {
  it('enumera antes de apagar e remove 1501 arquivos sem saltar a segunda página', async () => {
    const remaining = Array.from({ length: 1501 }, (_, i) => ({ id: `id-${i}`, name: `${i}.jpg` }));
    const removed: string[] = [];
    const list = vi.fn(async (_prefix: string, { offset, limit }: { offset: number; limit: number }) => ({ data: remaining.slice(offset, offset + limit), error: null }));
    const remove = vi.fn(async (paths: string[]) => {
      removed.push(...paths);
      const names = new Set(paths.map(p => p.split('/').pop()));
      for (let i = remaining.length - 1; i >= 0; i--) if (names.has(remaining[i].name)) remaining.splice(i, 1);
      return { error: null };
    });
    await purgeStorageFolders({ storage: { from: () => ({ list, remove }) } }, 'client-photos', ['client-1']);
    expect(remaining).toHaveLength(0);
    expect(new Set(removed).size).toBe(1501);
    expect(list.mock.calls.map(([, options]) => options.offset)).toEqual([0, 1000]);
  });

  it('não apaga a raiz do bucket', async () => {
    const list = vi.fn();
    await expect(purgeStorageFolders({ storage: { from: () => ({ list, remove: vi.fn() }) } }, 'client-photos', [''])).rejects.toThrow();
    expect(list).not.toHaveBeenCalled();
  });

  it('propaga o erro de armazenamento em vez de relatar sucesso', async () => {
    const list = vi.fn(async () => ({ data: [{ id: 'id-1', name: 'photo.jpg' }], error: null }));
    const remove = vi.fn(async () => ({ error: new Error('Falha') }));
    await expect(purgeStorageFolders({ storage: { from: () => ({ list, remove }) } }, 'client-photos', ['client-1'])).rejects.toThrow('Falha');
  });
});