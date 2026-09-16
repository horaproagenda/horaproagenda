import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  normalizeProductPermissions,
  resolveProductScope,
  REMOVED_PRODUCT_PERMISSION_KEYS,
} from '../productPermissions';

describe('permissões de produtos', () => {
  it('produtos próprios e produtos da clínica são mutuamente exclusivos', () => {
    const ligouClinica = normalizeProductPermissions(
      { can_manage_own_products: true, can_manage_products: true },
      'can_manage_products',
    );
    expect(ligouClinica).toMatchObject({ can_manage_products: true, can_manage_own_products: false });

    const ligouProprios = normalizeProductPermissions(
      { can_manage_own_products: true, can_manage_products: true },
      'can_manage_own_products',
    );
    expect(ligouProprios).toMatchObject({ can_manage_own_products: true, can_manage_products: false });
  });

  it('sem nenhuma opção marcada, o profissional fica com produtos próprios', () => {
    const result = normalizeProductPermissions({ can_manage_own_products: false, can_manage_products: false });
    expect(result.can_manage_own_products).toBe(true);
    expect(result.can_manage_products).toBe(false);
  });

  it('remove as opções antigas de visualização', () => {
    const result = normalizeProductPermissions({
      can_manage_products: true,
      can_view_other_products: true,
      can_view_only_own_products: true,
    });
    for (const key of REMOVED_PRODUCT_PERMISSION_KEYS) {
      expect(result).not.toHaveProperty(key);
    }
  });

  it('resolve o escopo a partir das permissões salvas', () => {
    expect(resolveProductScope({ can_manage_products: true })).toBe('clinic');
    expect(resolveProductScope({ can_manage_own_products: true })).toBe('own');
    expect(resolveProductScope(null)).toBe('own');
  });

  it('os formulários de profissional não oferecem mais as opções removidas', () => {
    const files = [
      'src/components/services/ManageProfessionalsDialog.tsx',
      'src/pages/ProfissionalDetalhes.tsx',
    ];
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      for (const key of REMOVED_PRODUCT_PERMISSION_KEYS) {
        expect(source).not.toContain(key);
      }
    }
  });

  it('o formulário de nova compra não repete venda nem datas de uso', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/pages/Produtos.tsx'), 'utf8');
    expect(source).not.toContain('purchaseForm.is_for_sale');
    expect(source).not.toContain('purchaseForm.usage_start_date');
    expect(source).not.toContain('purchaseForm.usage_end_date');
  });
});
