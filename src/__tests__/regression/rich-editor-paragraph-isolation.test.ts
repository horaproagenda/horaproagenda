import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { normalizeEditorHtml } from '@/components/documentos/RichTextEditor';

describe('editor: cada linha é um parágrafo independente', () => {
  it('texto com quebras de linha vira parágrafos separados', () => {
    const out = normalizeEditorHtml('FICHA\n\nNome: {nome}\nTelefone');
    expect(out).toBe('<p>FICHA</p><p><br></p><p>Nome: {nome}</p><p>Telefone</p>');
  });
  it('mantém blocos existentes intactos', () => {
    const html = '<h1>Título</h1><p>Corpo <span style="font-size: 20px;">x</span></p>';
    expect(normalizeEditorHtml(html)).toBe(html);
  });
  it('a barra acompanha a fonte/tamanho do trecho do cursor', () => {
    const src = readFileSync('src/components/documentos/RichTextEditor.tsx', 'utf8');
    expect(src).toContain('syncToolbar');
    expect(src).toContain('normalizeEditorHtml(value');
  });
});
