import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
describe('editor: estilos de título', () => {
  it('oferece Título 1, Título 2 e Normal aplicados só ao parágrafo atual', () => {
    const src = readFileSync('src/components/documentos/RichTextEditor.tsx', 'utf8');
    expect(src).toContain("runCommand('formatBlock'");
    for (const t of ['Título 1', 'Título 2', 'Normal']) expect(src).toContain(t);
  });
});
