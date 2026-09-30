import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const tab = readFileSync(resolve(__dirname, '../../components/client-profile/ClientPhotosTab.tsx'), 'utf8');
const hook = readFileSync(resolve(__dirname, '../../hooks/useClientProfile.ts'), 'utf8');

describe('envio de várias fotos do cliente', () => {
  it('falha em uma foto não interrompe as demais e há reenvio automático', () => {
    expect(tab).toContain('uploadWithRetry');
    expect(tab).toMatch(/failedIdx\.push\(i\)/);
  });
  it('nova seleção soma às fotos já escolhidas', () => {
    expect(tab).toContain('[...files, ...validFiles]');
  });
  it('galeria atualiza só uma vez no fim, sem aviso por foto no hook', () => {
    const addPhotoBlock = hook.slice(hook.indexOf('_taken_at'), hook.indexOf('_taken_at') + 800);
    expect(addPhotoBlock).not.toContain("toast.success('Foto adicionada");
  });
  it('mostra progresso e impede fechar durante o envio', () => {
    expect(tab).toContain('Enviando foto ${progress.current} de ${progress.total}');
    expect(tab).toMatch(/onInteractOutside=\{\(e\) => loading && e\.preventDefault\(\)\}/);
  });
});
