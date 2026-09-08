import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Anti-regressão: os formulários de edição de serviço/kit e de pacote
 * (comum e sequencial) precisam manter o seletor de privacidade e salvar
 * o valor escolhido.
 */
const files = [
  'src/components/services/ServiceDetailDialog.tsx',
  'src/components/services/PackageTemplateDetailDialog.tsx',
];

describe('privacidade no formulário de edição', () => {
  for (const file of files) {
    it(`mantém o seletor de privacidade em ${file}`, () => {
      const src = readFileSync(file, 'utf8');
      expect(src).toContain('<VisibilitySelect');
      expect(src).toContain('recordVis.visibilityField');
      expect(src).toContain('recordVis.setVisibility(');
    });
  }
});
