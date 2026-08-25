// Planos do Hora Pro — pacotes por quantidade de usuários.
//
// FONTE ÚNICA DA VERDADE DOS VALORES: o backend
// (supabase/functions/_shared/billingPlans.ts). Esta tabela é o ESPELHO para
// exibição imediata; `usePricing()` busca os valores do servidor e a criação
// da cobrança SEMPRE valida o preço no edge function — o navegador nunca
// define preço.
//
// Regras comerciais:
//  - Mensal: valor do pacote.
//  - Semestral: mensal × 6 × 0,90 (10% de desconto).
//  - Anual: mensal × 12 × 0,80 (20% de desconto).
//  - Teste gratuito de 20 dias com cartão cadastrado; a primeira cobrança
//    acontece automaticamente no fim do teste.
//  - Carência de 2 dias corridos após falha de pagamento; depois, suspensão.
export interface Plan {
  seats: number;
  priceBRL: number; // preço mensal do pacote em reais
  name: string;
}

export const PLANS: Plan[] = [
  { seats: 1,  priceBRL: 79.9,  name: '1 usuário'   },
  { seats: 5,  priceBRL: 250,   name: '5 usuários'  },
  { seats: 8,  priceBRL: 400,   name: '8 usuários'  },
  { seats: 10, priceBRL: 500,   name: '10 usuários' },
  { seats: 15, priceBRL: 750,   name: '15 usuários' },
  { seats: 20, priceBRL: 1000,  name: '20 usuários' },
  { seats: 25, priceBRL: 1250,  name: '25 usuários' },
  { seats: 30, priceBRL: 1500,  name: '30 usuários' },
];

/** Seats permitidos no checkout — validados também no edge function. */
export const ALLOWED_SEATS: number[] = PLANS.map(p => p.seats);

/** Duração do teste gratuito (dias), com cartão cadastrado. */
export const TRIAL_DAYS = 20;

/** Carência em dias corridos após falha de pagamento, antes da suspensão. */
export const GRACE_DAYS = 2;

export const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Períodos de cobrança recorrente: mensal, semestral (−10%) e anual (−20%).
export interface BillingPeriod {
  months: number;
  discount: number; // 0..1 — aplicado ao total do ciclo (mensal × meses)
  label: string;
  badge?: string;
}

export const BILLING_PERIODS: BillingPeriod[] = [
  { months: 1,  discount: 0,    label: 'Mensal' },
  { months: 6,  discount: 0.10, label: 'Semestral', badge: '-10%' },
  { months: 12, discount: 0.20, label: 'Anual',     badge: '-20%' },
];

/** Calcula o total do ciclo: mensal × meses × (1 − desconto). */
export function periodTotal(monthlyPriceBRL: number, months: number): number {
  const p = BILLING_PERIODS.find(b => b.months === months) ?? BILLING_PERIODS[0];
  return Math.round(monthlyPriceBRL * months * (1 - p.discount) * 100) / 100;
}

/** Menor pacote que comporta a quantidade de usuários informada. */
export function suggestPlan(seatsNeeded: number): Plan {
  return PLANS.find(p => p.seats >= seatsNeeded) ?? PLANS[PLANS.length - 1];
}

export const APP_MODULES = [
  { key: 'agenda',        label: 'Agenda' },
  { key: 'clientes',      label: 'Clientes' },
  { key: 'financeiro',    label: 'Financeiro' },
  { key: 'caixa',         label: 'Caixa' },
  { key: 'produtos',      label: 'Produtos' },
  { key: 'servicos',      label: 'Serviços' },
  { key: 'cadastros',     label: 'Cadastros' },
  { key: 'relatorios',    label: 'Relatórios' },
  { key: 'documentos',    label: 'Documentos' },
  { key: 'lembretes',     label: 'Lembretes' },
  { key: 'configuracoes', label: 'Configurações' },
  { key: 'auditoria',     label: 'Auditoria' },
  { key: 'assinatura',    label: 'Assinatura' },
] as const;

export type AppModuleKey = typeof APP_MODULES[number]['key'];
export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';
