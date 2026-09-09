import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regressão: profissional com a permissão "Ver produtos de todos" precisa
 * enxergar todos os produtos da agenda. O filtro por autoria só vale para
 * quem está limitado aos próprios produtos.
 */
describe('escopo da lista de produtos', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/hooks/useProducts.ts'), 'utf8');

  it('usa a permissão onlyOwnProducts para decidir o filtro', () => {
    expect(source).toContain('onlyOwnProducts');
    expect(source).toMatch(/if \(isPrivileged \|\| !user\?\.id \|\| !onlyOwnProducts\) return allProducts;/);
  });

  it('não filtra por autoria sem consultar a permissão', () => {
    const filterLine = source
      .split('\n')
      .find((line) => line.includes("p.created_by === user.id"));
    expect(filterLine).toBeTruthy();
    expect(source).toMatch(/onlyOwnProducts[\s\S]{0,200}created_by === user\.id/);
  });
});
