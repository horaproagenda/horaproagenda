// Fluxo de retorno do Stripe Checkout / Portal.
//
// Regra: o checkout abre na MESMA aba. Abrir em nova aba deixava o app antigo
// preso num estado desatualizado (assinatura inativa) enquanto o pagamento era
// confirmado na outra aba. Guardamos a rota de origem para voltar exatamente
// para onde o usuário estava depois do pagamento.

const RETURN_KEY = 'horapro:checkout-return';
export const SUBSCRIPTION_SYNC_KEY = 'horapro:subscription-updated';

/** Navega para o Stripe na mesma aba, memorizando a rota de origem. */
export function goToStripe(url: string) {
  try {
    const from = `${window.location.pathname}${window.location.search}`;
    // Não memoriza as páginas de retorno do próprio checkout.
    if (!from.startsWith('/assinatura/sucesso') && !from.startsWith('/assinatura/cancelado')) {
      sessionStorage.setItem(RETURN_KEY, from);
    }
  } catch {
    /* storage indisponível — segue sem memorizar */
  }
  window.location.assign(url);
}

/** Rota para onde voltar após o Stripe (padrão: dashboard). */
export function consumeCheckoutReturnPath(fallback = '/agenda'): string {
  try {
    const stored = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    // Evita devolver o usuário a telas de assinatura/checkout (onde ele veria
    // novamente a oferta de pagamento logo após ter pago).
    const blocked = ['/assinatura', '/conta-inativa', '/auth'];
    if (stored && stored.startsWith('/') && !blocked.some((b) => stored.startsWith(b))) {
      return stored;
    }
  } catch {
    /* noop */
  }
  return fallback;
}

/** Avisa outras abas abertas que a assinatura mudou (para revalidarem o acesso). */
export function notifySubscriptionUpdated() {
  try {
    localStorage.setItem(SUBSCRIPTION_SYNC_KEY, String(Date.now()));
  } catch {
    /* noop */
  }
}
