// Catálogo de "planos" publicados no Asaas como links de assinatura.
//
// O app cobra a assinatura por cartão (recorrência automática + teste de 20
// dias). Estes links existem para venda fora do app: o cliente escolhe cartão
// de crédito, cartão de débito, Pix ou boleto na própria tela do Asaas.
//
// Fonte única da verdade dos valores: _shared/billingPlans.ts. Aqui só
// derivamos os 24 pares (8 pacotes de usuários × 3 ciclos) e a chave estável de
// reconciliação, para que sincronizar duas vezes NUNCA duplique links.
//
// Sem dependências de Deno de propósito: o mesmo código roda nas Edge Functions
// e nos testes de regressão (Vitest).

import {
  BILLING_CYCLES,
  BILLING_PLANS,
  quoteCycle,
  type BillingCycleKey,
} from "./billingPlans.ts";

/** Prazo (dias) para pagar boleto/Pix de cada ciclo. */
export const PLAN_LINK_DUE_DATE_LIMIT_DAYS = 5;

export interface PlanLinkDef {
  seats: number;
  months: number;
  cycleKey: BillingCycleKey;
  cycleLabel: string;
  /** Ciclo equivalente na API do Asaas (MONTHLY | SEMIANNUALLY | YEARLY). */
  asaasCycle: string;
  totalCents: number;
  name: string;
  description: string;
  externalReference: string;
}

/** Chave estável do plano no Asaas — usada para reaproveitar o link existente. */
export function planLinkExternalReference(seats: number, months: number): string {
  return `plan:seats:${seats}|months:${months}`;
}

export function parsePlanLinkReference(
  reference: string | null | undefined,
): { seats: number | null; months: number | null } {
  const raw = typeof reference === "string" ? reference : "";
  if (!raw.includes("plan:")) return { seats: null, months: null };
  const seats = Number(raw.match(/seats:(\d+)/)?.[1] ?? NaN);
  const months = Number(raw.match(/months:(\d+)/)?.[1] ?? NaN);
  return {
    seats: Number.isFinite(seats) ? seats : null,
    months: Number.isFinite(months) ? months : null,
  };
}

export function planLinkName(seats: number, cycleLabel: string): string {
  return `Hora Pro — ${seats} usuário(s) · ${cycleLabel}`;
}

/** Os 24 planos (8 pacotes × 3 ciclos) com valores calculados no backend. */
export function buildPlanLinkCatalog(): PlanLinkDef[] {
  const out: PlanLinkDef[] = [];
  for (const plan of BILLING_PLANS) {
    for (const cycle of BILLING_CYCLES) {
      const quote = quoteCycle(plan.seats, cycle.months);
      if (!quote) continue;
      const discount = quote.discountPercentage > 0 ? ` (−${quote.discountPercentage}%)` : "";
      out.push({
        seats: plan.seats,
        months: cycle.months,
        cycleKey: cycle.key,
        cycleLabel: cycle.label,
        asaasCycle: cycle.asaasCycle,
        totalCents: quote.totalCents,
        name: planLinkName(plan.seats, cycle.label),
        description:
          `Assinatura Hora Pro para até ${plan.seats} usuário(s), cobrança ${cycle.label.toLowerCase()}${discount}. ` +
          `Pague com cartão de crédito, cartão de débito, Pix ou boleto. ` +
          `[${planLinkExternalReference(plan.seats, cycle.months)}]`,
        externalReference: planLinkExternalReference(plan.seats, cycle.months),
      });
    }
  }
  return out;
}

export interface RemotePaymentLinkLike {
  id: string;
  name?: string | null;
  description?: string | null;
  externalReference?: string | null;
  deleted?: boolean | null;
  url?: string | null;
}

/**
 * Encontra o link já existente no Asaas para o plano. Reconhece a chave tanto
 * no `externalReference` quanto na descrição (o campo é opcional na API de
 * links de pagamento) e, por último, pelo nome exato do plano.
 */
export function pickReusablePaymentLink(
  links: RemotePaymentLinkLike[] | null | undefined,
  def: PlanLinkDef,
): RemotePaymentLinkLike | null {
  for (const link of links ?? []) {
    if (!link?.id || link.deleted) continue;
    if (link.externalReference === def.externalReference) return link;
    if (link.description?.includes(def.externalReference)) return link;
  }
  for (const link of links ?? []) {
    if (!link?.id || link.deleted) continue;
    if (link.name === def.name) return link;
  }
  return null;
}

/**
 * Corpo enviado ao Asaas. `billingType: "UNDEFINED"` é o que libera todas as
 * formas de pagamento; `chargeType: "RECURRENT"` cria assinatura no ciclo.
 */
export function planLinkPayload(def: PlanLinkDef): Record<string, unknown> {
  return {
    name: def.name,
    description: def.description,
    value: def.totalCents / 100,
    billingType: "UNDEFINED",
    chargeType: "RECURRENT",
    subscriptionCycle: def.asaasCycle,
    dueDateLimitDays: PLAN_LINK_DUE_DATE_LIMIT_DAYS,
    notificationEnabled: true,
    externalReference: def.externalReference,
  };
}
