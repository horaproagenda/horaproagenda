import { describe, it, expect } from 'vitest';
import { applyInlineStyle } from '@/components/documentos/RichTextEditor';

describe('applyInlineStyle aplica só no trecho selecionado', () => {
  it('muda a fonte só no título sem tocar no parágrafo', () => {
    const ed = document.createElement('div');
    ed.innerHTML = '<h2>Titulo</h2><p>Corpo do texto</p>';
    document.body.appendChild(ed);
    const r = document.createRange();
    r.selectNodeContents(ed.querySelector('h2')!.firstChild!);
    const sel = window.getSelection()!; sel.removeAllRanges(); sel.addRange(r);
    expect(applyInlineStyle(ed, 'fontSize', '24px')).toBe(true);
    expect(ed.querySelector('h2 span')?.getAttribute('style')).toContain('24px');
    expect(ed.querySelector('p')!.innerHTML).toBe('Corpo do texto');
  });
  it('muda só uma palavra no meio do parágrafo', () => {
    const ed = document.createElement('div');
    ed.innerHTML = '<h2>Titulo</h2><p>Corpo do texto</p>';
    document.body.appendChild(ed);
    const t = ed.querySelector('p')!.firstChild as Text;
    const r = document.createRange(); r.setStart(t, 6); r.setEnd(t, 8);
    const sel = window.getSelection()!; sel.removeAllRanges(); sel.addRange(r);
    applyInlineStyle(ed, 'fontFamily', 'Georgia');
    expect(ed.querySelector('p')!.innerHTML).toBe('Corpo <span style="font-family: Georgia;">do</span> texto');
    expect(ed.querySelector('h2')!.innerHTML).toBe('Titulo');
  });
});
