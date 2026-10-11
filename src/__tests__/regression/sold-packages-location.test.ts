import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Pacotes vendidos', () => {
  it('consulta sem relação ambígua entre package_appointments e appointments', () => {
    const src = readFileSync('src/components/financeiro/PacotesFinanceiro.tsx', 'utf-8');
    expect(src).not.toMatch(/appointment:appointments\(/);
  });

  it('não fica mais como aba no Financeiro', () => {
    const src = readFileSync('src/pages/Financeiro.tsx', 'utf-8');
    expect(src).not.toContain('<PacotesFinanceiro');
    expect(src).not.toContain("v: 'pacotes'");
  });
});
