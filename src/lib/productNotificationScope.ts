/**
 * Quem pode ser avisado sobre cada produto.
 *
 * Regras combinadas com o cadastro do profissional:
 * - profissional com "produtos próprios" (estoque separado) recebe avisos
 *   apenas dos produtos dele;
 * - quem tem acesso aos produtos da clínica recebe os avisos da clínica, mas
 *   nunca dos produtos privados de outro profissional;
 * - administração e recepção seguem a mesma regra: produto privado de um
 *   profissional não gera aviso para os demais.
 */
export interface ProductNotificationScope {
  /** id do usuário logado */
  userId?: string | null;
  /** id do cadastro de profissional do usuário logado */
  professionalId?: string | null;
  /** true quando o profissional só enxerga os produtos dele */
  onlyOwnProducts: boolean;
}

export interface ProductNotificationTarget {
  created_by?: string | null;
  owner_professional_id?: string | null;
  visibility?: string | null;
}

export function canBeNotifiedAboutProduct(
  product: ProductNotificationTarget,
  { userId, professionalId, onlyOwnProducts }: ProductNotificationScope,
): boolean {
  const isOwner =
    (!!professionalId && product.owner_professional_id === professionalId) ||
    (!product.owner_professional_id && !!userId && product.created_by === userId);

  if (onlyOwnProducts) return isOwner;

  // Produto de outro profissional (estoque próprio) nunca notifica a clínica.
  if (product.owner_professional_id) return isOwner;
  if (product.visibility === 'private' && product.created_by) return isOwner;

  return true;
}

export function filterProductsForNotifications<T extends ProductNotificationTarget>(
  products: T[],
  scope: ProductNotificationScope,
): T[] {
  return products.filter((product) => canBeNotifiedAboutProduct(product, scope));
}
