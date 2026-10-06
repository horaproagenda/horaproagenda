import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('edição de produto isolada pelo ID único', () => {
  it('a janela do produto é recriada a cada produto', () => {
    expect(read('src/pages/Produtos.tsx')).toContain("key={selectedProduct?.id ?? 'none'}");
  });
  it('trocar de produto descarta edições em andamento', () => {
    const src = read('src/components/produtos/ProductDetailDialog.tsx');
    expect(src).toMatch(/setEditForm\(\{\}\);[\s\S]*setEditingPurchaseId\(null\);[\s\S]*\}, \[product\?\.id, open\]\)/);
  });
  it('salvar compra só atualiza o produto dono da compra', () => {
    const src = read('src/components/produtos/ProductDetailDialog.tsx');
    expect(src).toContain('const ownerProductId = purchase.product_id;');
    expect(src).not.toMatch(/id: product!\.id,\s*\n\s*(started_using_at|finished_at)/);
  });
});
