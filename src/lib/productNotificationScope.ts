/**
 * Quem pode ser avisado sobre cada produto.
 *
 * Regras combinadas com o cadastro do profissional:
 * - profissional que só administra os próprios produtos ("estoque próprio")
 *   recebe avisos apenas dos produtos que ele mesmo cadastrou;
 * - quem tem acesso aos produtos da clínica recebe os avisos da clínica, mas
 *   nunca dos produtos privados de outro profissional;
 * - administração e recepção seguem a mesma regra: produto privado de um
 *   profissional não gera aviso para os demais.
 */
export interface ProductNotificationScope {
  /** id do usuário logado */
  userId?: string | null;
  /** true quando o profissional só enxerga os produtos que criou */
  onlyOwnProducts: boolean;
}

export interface ProductNotificationTarget {
  created_by?: string | null;
  visibility?: string | null;
}

export function canBeNotifiedAboutProduct(
  product: ProductNotificationTarget,
  { userId, onlyOwnProducts }: ProductNotificationScope,
): boolean {
  const isOwner = !!userId && product.created_by === userId;

  if (onlyOwnProducts) return isOwner;

  // Produto privado de outra pessoa nunca notifica a clínica.
  if (product.visibility === 'private' && product.created_by) return isOwner;

  return true;
}

export function filterProductsForNotifications<T extends ProductNotificationTarget>(
  products: T[],
  scope: ProductNotificationScope,
): T[] {
  return products.filter((product) => canBeNotifiedAboutProduct(product, scope));
}
