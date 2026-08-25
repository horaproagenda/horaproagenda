// Planos e preços da assinatura Hora Pro — FONTE ÚNICA DA VERDADE (backend).
//
// Os valores são definidos AQUI e validados no servidor em toda criação de
// assinatura/cobrança: o navegador nunca define preço. O frontend espelha esta
// tabela apenas para exibição (src/lib/plans.ts).
//
// Regras comerciais:
//  - 8 pacotes por quantidade de usuários (1 a 30).
//  - Ciclos: mensal (sem desconto), semestral (6 × mensal − 10%), anual
//    (12 × mensal − 20%).
//  - Teste gratuito de 20 dias com cartão cadastrado; a primeira cobrança
//    acontece automaticamente no fim do teste.
//  - Carência de 2 dias corridos após falha de pagamento; depois, suspensão.

export interface BillingPlan {
  seats: number;
  monthlyCents: number;
}

export const BILLING_PLANS: BillingPlan[] = [
  { seats: 1,  monthlyCents: 7990 },   // R$ 79,90
  { seats: 5,  monthlyCents: 25000 },  // R$ 250,00
  { seats: 8,  monthlyCents: 40000 },  // R$ 400,00
  { seats: 10, monthlyCents: 50000 },  // R$ 500,00
  { seats: 15, monthlyCents: 75000 },  // R$ 750,00
  { seats: 20, monthlyCents: 100000 }, // R$ 1.000,00
  { seats: 25, monthlyCents: 125000 }, // R$ 1.250,00
  { seats: 30, monthlyCents: 150000 }, // R$ 1.500,00
];

export const ALLOWED_SEATS = new Set<number>(BILLING_PLANS.map((p) => p.seats));

export type BillingCycleKey = "monthly" | "semiannual" | "annual";

export interface BillingCycleDef {
  months: number;
  key: BillingCycleKey;
  label: string;
  /** Desconto sobre o total do ciclo (0..1). */
  discount: number;
  /** Ciclo equivalente na API do Asaas. */
  asaasCycle: string;
}

export const BILLING_CYCLES: BillingCycleDef[] = [
  { months: 1,  key: "monthly",    label: "Mensal",    discount: 0,    asaasCycle: "MONTHLY" },
  { months: 6,  key: "semiannual", label: "Semestral", discount: 0.10, asaasCycle: "SEMIANNUALLY" },
  { months: 12, key: "annual",     label: "Anual",     discount: 0.20, asaasCycle: "YEARLY" },
];

/** Duração do teste gratuito (dias), com cartão cadastrado. */
export const TRIAL_DAYS = 20;

/** Carência em dias corridos após falha de pagamento, antes da suspensão. */
export const GRACE_DAYS = 2;

export function planForSeats(seats: number): BillingPlan | null {
  return BILLING_PLANS.find((p) => p.seats === seats) ?? null;
}

export function cycleForMonths(months: number): BillingCycleDef | null {
  return BILLING_CYCLES.find((c) => c.months === months) ?? null;
}

export interface CycleQuote {
  seats: number;
  months: number;
  cycleKey: BillingCycleKey;
  /** Valor mensal de tabela (centavos). */
  monthlyCents: number;
  /** Valor cheio do ciclo sem desconto (centavos). */
  fullCents: number;
  /** Desconto aplicado (centavos). */
  discountCents: number;
  /** Percentual de desconto (0, 10 ou 20). */
  discountPercentage: number;
  /** Valor final cobrado por ciclo (centavos). */
  totalCents: number;
}

/**
 * Calcula o valor do ciclo no backend.
 * semestral = mensal × 6 × 0,90 · anual = mensal × 12 × 0,80
 */
export function quoteCycle(seats: number, months: number): CycleQuote | null {
  const plan = planForSeats(seats);
  const cycle = cycleForMonths(months);
  if (!plan || !cycle) return null;
  const fullCents = plan.monthlyCents * cycle.months;
  const totalCents = Math.round(fullCents * (1 - cycle.discount));
  return {
    seats,
    months,
    cycleKey: cycle.key,
    monthlyCents: plan.monthlyCents,
    fullCents,
    discountCents: fullCents - totalCents,
    discountPercentage: Math.round(cycle.discount * 100),
    totalCents,
  };
}

/** Bandeira do cartão a partir dos primeiros dígitos (somente metadado). */
export function detectCardBrand(cardNumber: string): string {
  const n = cardNumber.replace(/\D+/g, "");
  if (/^4/.test(n)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(n)) return "mastercard";
  if (/^3[47]/.test(n)) return "amex";
  if (/^3(0[0-5]|[68])/.test(n)) return "diners";
  if (/^35/.test(n)) return "jcb";
  if (/^(606282|3841|637095|637612|637599)/.test(n)) return "hipercard";
  if (/^(636368|438935|504175|451416|636297|5067|4576|4011)/.test(n)) return "elo";
  return "cartao";
}

/** Validação de Luhn do número do cartão. */
export function luhnValid(cardNumber: string): boolean {
  const n = cardNumber.replace(/\D+/g, "");
  if (n.length < 13 || n.length > 19) return false;
  let sum = 0;
  let dbl = false;
  for (let i = n.length - 1; i >= 0; i -= 1) {
    let d = Number(n[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}
