import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('PDF do perfil do cliente com documento formatado', () => {
  it('usa o render visual em vez de desenhar o HTML como texto', () => {
    const src = readFileSync('src/components/client-profile/ClientDocumentsTab.tsx', 'utf8');
    expect(src).toContain('isRichDocument(docItem.content)');
    expect(src).toContain('renderRichDocumentPdfBytes');
  });
});
