// Reconciliação e idempotência da assinatura no Asaas.
//
// Problema que este módulo resolve: a assinatura é criada primeiro no Asaas e
// só depois gravada no banco. Se a gravação local falhar (rede, coluna,
// timeout), o usuário tenta de novo e — sem reconciliação — nasceria uma
// SEGUNDA assinatura no gateway, gerando cobrança duplicada.
//
// A chave de reconciliação é o `externalReference`, que sempre carrega o dono
// da conta. Antes de criar qualquer coisa, procuramos no Asaas uma assinatura
// reaproveitável para o mesmo dono; se existir, apenas atualizamos.
//
// Sem dependências externas de propósito: o mesmo código é usado pelas Edge
// Functions (Deno) e pelos testes de regressão (Vitest).

export interface RemoteSubscriptionLike {
  id: string;
  status?: string | null;
  externalReference?: string | null;
  deleted?: boolean | null;
}

export interface ExternalReferenceParts {
  ownerUserId: string | null;
  seats: number | null;
  months: number | null;
}

/** Estados do Asaas em que a assinatura ainda serve para o mesmo dono. */
const REUSABLE_STATUSES = new Set(["ACTIVE", "OVERDUE", "PENDING"]);

/** Chave estável usada em toda cobrança/assinatura da conta. */
export function subscriptionExternalReference(
  ownerUserId: string,
  seats: number,
  months: number,
): string {
  return `user:${ownerUserId}|seats:${seats}|months:${months}`;
}

/** Lê dono, plano e ciclo de um externalReference (tolerante a formatos antigos). */
export function parseSubscriptionReference(
  reference: string | null | undefined,
): ExternalReferenceParts {
  const raw = typeof reference === "string" ? reference : "";
  const owner = raw.match(/user:([0-9a-fA-F-]{36})/)?.[1] ?? null;
  const seats = Number(raw.match(/seats:(\d+)/)?.[1] ?? NaN);
  const months = Number(raw.match(/months:(\d+)/)?.[1] ?? NaN);
  return {
    ownerUserId: owner,
    seats: Number.isFinite(seats) ? seats : null,
    months: Number.isFinite(months) ? months : null,
  };
}

/**
 * Escolhe, entre as assinaturas já existentes no Asaas, uma que pertença ao
 * dono da conta e possa ser reaproveitada. Retorna `null` quando é seguro
 * criar uma nova.
 */
export function pickReusableSubscription(
  subscriptions: RemoteSubscriptionLike[] | null | undefined,
  ownerUserId: string,
): string | null {
  for (const sub of subscriptions ?? []) {
    if (!sub?.id || sub.deleted) continue;
    if (parseSubscriptionReference(sub.externalReference).ownerUserId !== ownerUserId) continue;
    const status = (sub.status ?? "ACTIVE").toUpperCase();
    if (!REUSABLE_STATUSES.has(status)) continue;
    return sub.id;
  }
  return null;
}

/** Fim do período pago: data do pagamento + meses do ciclo. */
export function paidPeriodEnd(paidAt: Date, months: number): Date {
  const end = new Date(paidAt.getTime());
  end.setMonth(end.getMonth() + Math.max(1, Math.trunc(months || 1)));
  return end;
}
