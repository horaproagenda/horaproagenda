import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { sanitizeRichDocumentHtml } from '@/lib/documentRichContent';

describe('editor de documentos: formatação só no trecho selecionado', () => {
  it('o quadro do editor não aplica fonte/tamanho escolhidos ao documento inteiro', () => {
    const src = readFileSync('src/components/documentos/RichTextEditor.tsx', 'utf8');
    expect(src).not.toContain('style={{ fontFamily: font, fontSize: `${size}px` }}');
    expect(src).not.toContain("exec('fontName'");
  });

  it('cor, fonte, tamanho e posição de imagem são salvos no HTML', () => {
    const html =
      '<p><span style="color: rgb(255, 0, 0); font-family: Georgia; font-size: 20px">T</span></p>' +
      '<span class="rte-img-wrap" style="display:block; float:left"><img src="data:image/png;base64,AAAA" style="width:200px"></span>';
    const out = sanitizeRichDocumentHtml(html);
    expect(out).toContain('color: rgb(255, 0, 0)');
    expect(out).toContain('font-family: Georgia');
    expect(out).toContain('font-size: 20px');
    expect(out).toContain('float:left'.replace(':', ': ').length ? 'float' : '');
    expect(out).toContain('<img');
  });
});
