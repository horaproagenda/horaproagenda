/**
 * Permissões de Produtos do profissional.
 *
 * Existem apenas duas opções, mutuamente exclusivas:
 * - `can_manage_own_products` → **produtos próprios**: estoque totalmente
 *   separado. O profissional cria, edita e vincula apenas os produtos dele.
 *   Compras, caixa e financeiro desses produtos ficam com ele, nunca na clínica.
 * - `can_manage_products` → **produtos da clínica**: vê, cadastra, edita,
 *   registra entradas/saídas e vincula os produtos da clínica.
 *
 * As chaves antigas `can_view_other_products` e `can_view_only_own_products`
 * foram removidas (eram duplicação: o escopo já define o que ele vê).
 */

export const PRODUCT_PERMISSION_KEYS = [
  'can_manage_own_products',
  'can_manage_products',
] as const;

export const REMOVED_PRODUCT_PERMISSION_KEYS = [
  'can_view_other_products',
  'can_view_only_own_products',
] as const;

export type ProductScope = 'own' | 'clinic';

/** Escopo derivado das permissões salvas. Sem nada marcado → produtos próprios. */
export function resolveProductScope(
  permissions: Record<string, unknown> | null | undefined,
): ProductScope {
  return permissions?.can_manage_products === true ? 'clinic' : 'own';
}

/**
 * Aplica a exclusão mútua e remove as chaves que não existem mais.
 * `changedKey` indica qual opção o usuário acabou de ligar.
 */
export function normalizeProductPermissions(
  permissions: Record<string, boolean>,
  changedKey?: string,
): Record<string, boolean> {
  const next = { ...permissions };
  for (const key of REMOVED_PRODUCT_PERMISSION_KEYS) delete next[key];

  if (changedKey === 'can_manage_products' && next.can_manage_products) {
    next.can_manage_own_products = false;
  }
  if (changedKey === 'can_manage_own_products' && next.can_manage_own_products) {
    next.can_manage_products = false;
  }

  // Nunca as duas ao mesmo tempo: produtos da clínica manda.
  if (next.can_manage_products && next.can_manage_own_products) {
    next.can_manage_own_products = false;
  }
  // Nenhuma marcada → produtos próprios (padrão de quem só usa os seus).
  if (!next.can_manage_products && !next.can_manage_own_products) {
    next.can_manage_own_products = true;
  }

  return next;
}
