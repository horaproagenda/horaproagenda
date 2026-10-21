import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf8');

describe('documentos: links e preenchimento', () => {
  it('nunca lê a coluna protegida do código do link direto da tabela (causava "Erro ao gerar link")', () => {
    const hook = src('hooks/useDocumentFillLinks.ts');
    const selects = [...hook.matchAll(/\.select\('([^']*)'\)/g)].map((m) => m[1]);
    expect(selects.length).toBeGreaterThan(0);
    for (const s of selects) {
      expect(s).not.toBe('*');
      expect(s.split(',').map((x) => x.trim())).not.toContain('token');
    }
    expect(hook).toContain('get_document_fill_link_token');
  });

  it('janela de preenchimento não tem mais "Adicionar sem assinar e preencher" e oferece envio pelo WhatsApp', () => {
    const dlg = src('components/documentos/FillDocumentDialog.tsx');
    expect(dlg).not.toContain('Adicionar sem assinar e preencher');
    expect(dlg).toContain('Enviar para preenchimento no WhatsApp');
  });

  it('a página Documentos não oferece "Preencher p/ Cliente" (fica no perfil do cliente)', () => {
    expect(src('pages/Documentos.tsx')).not.toContain('Preencher p/ Cliente');
  });
});
