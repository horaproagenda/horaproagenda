import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regressão: estoques separados.
 * - "Produtos próprios": o profissional só enxerga os produtos dele.
 * - "Produtos da clínica": enxerga o estoque da clínica.
 * O filtro é pelo dono do produto (owner_professional_id), nunca só por autoria.
 */
describe('escopo da lista de produtos', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/hooks/useProducts.ts'), 'utf8');

  it('decide o filtro pelo escopo de produtos do profissional', () => {
    expect(source).toContain('productScope');
    expect(source).toMatch(/if \(isPrivileged \|\| productScope === 'clinic'\)/);
  });

  it('filtra pelo dono do produto', () => {
    expect(source).toContain('owner_professional_id === professionalId');
  });

  it('não mostra o estoque da clínica para quem tem produtos próprios', () => {
    expect(source).toMatch(/!p\.owner_professional_id && !!user\?\.id && p\.created_by === user\.id/);
  });

  it('grava o dono ao cadastrar produto próprio e deixa sem dono o da clínica', () => {
    expect(source).toMatch(/productScope === 'own'[\s\S]{0,160}owner_professional_id: professionalId/);
    expect(source).toMatch(/productScope === 'clinic'[\s\S]{0,160}owner_professional_id: null/);
  });

  it('usa o caixa do dono do produto na compra', () => {
    expect(source).toContain('resolveFinancialDestination(ownerProfessionalId)');
  });
});
