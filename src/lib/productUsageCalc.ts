/**
 * Regras puras do consumo de produto por atendimento.
 *
 * Dois modos, que NUNCA se misturam:
 *  - 'manual'  → o usuário informa a quantidade consumida por atendimento.
 *  - 'auto'    → o app conta os atendimentos válidos do período e calcula a média.
 *
 * Todos os cálculos são feitos em uma unidade base (g para massa, ml para
 * volume, un para contagem), evitando misturar kg com g ou L com ml.
 */

export type UsageCalcMode = 'manual' | 'auto';

export type MassUnit = 'mg' | 'g' | 'kg';
export type VolumeUnit = 'ml' | 'l';

const BASE_FACTORS: Record<string, { base: string; factor: number }> = {
  mg: { base: 'g', factor: 0.001 },
  g: { base: 'g', factor: 1 },
  kg: { base: 'g', factor: 1000 },
  ml: { base: 'ml', factor: 1 },
  l: { base: 'ml', factor: 1000 },
  un: { base: 'un', factor: 1 },
};

export function getBaseUnit(unit: string | null | undefined): string | null {
  if (!unit) return null;
  return BASE_FACTORS[unit]?.base ?? null;
}

/** Converte um valor para a unidade base da sua família (g, ml ou un). */
export function toBaseQuantity(value: number, unit: string | null | undefined): number | null {
  if (!Number.isFinite(value)) return null;
  const entry = unit ? BASE_FACTORS[unit] : undefined;
  if (!entry) return null;
  return value * entry.factor;
}

/**
 * Converte entre unidades. Só converte dentro da mesma família (massa↔massa,
 * volume↔volume, un↔un). Retorna null quando as famílias não batem — o
 * chamador deve avisar o usuário em vez de somar valores incompatíveis.
 */
export function convertWithinFamily(
  value: number,
  fromUnit: string | null | undefined,
  toUnit: string | null | undefined,
): number | null {
  if (!Number.isFinite(value)) return null;
  const from = fromUnit ? BASE_FACTORS[fromUnit] : undefined;
  const to = toUnit ? BASE_FACTORS[toUnit] : undefined;
  if (!from || !to) return null;
  if (from.base !== to.base) return null;
  return (value * from.factor) / to.factor;
}

/** Quantos frascos de `containerAmount` cabem no estoque total. */
export function containerEquivalents(params: {
  stockQuantity: number;
  stockUnit: string;
  containerAmount: number;
  containerUnit: string;
}): number | null {
  const stockBase = toBaseQuantity(params.stockQuantity, params.stockUnit);
  const containerBase = toBaseQuantity(params.containerAmount, params.containerUnit);
  if (stockBase === null || containerBase === null) return null;
  if (getBaseUnit(params.stockUnit) !== getBaseUnit(params.containerUnit)) return null;
  if (containerBase <= 0) return null;
  return Math.floor(stockBase / containerBase);
}

/** Atendimentos possíveis com uma quantidade disponível e um consumo por atendimento. */
export function appointmentsFromQuantity(params: {
  quantity: number;
  quantityUnit: string;
  perAppointment: number;
  perAppointmentUnit: string;
}): number | null {
  const available = toBaseQuantity(params.quantity, params.quantityUnit);
  const per = toBaseQuantity(params.perAppointment, params.perAppointmentUnit);
  if (available === null || per === null) return null;
  if (getBaseUnit(params.quantityUnit) !== getBaseUnit(params.perAppointmentUnit)) return null;
  if (per <= 0) return null;
  return Math.floor(available / per);
}

export interface UsageAppointment {
  id: string;
  service_id?: string | null;
  start_time: string;
  status?: string | null;
}

/** Status que NÃO consomem produto e por isso são ignorados na contagem. */
const NON_CONSUMING_STATUSES = new Set([
  'cancelled',
  'cancelado',
  'canceled',
  'missed',
  'falta',
  'no_show',
  'rescheduled',
  'remarcado',
]);

function dayKey(iso: string): string {
  // Aceita '2026-08-01', '2026-08-01T10:00:00Z' etc. Usa a data local.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Atendimentos válidos do(s) serviço(s) no período (datas inclusivas),
 * sem cancelados/faltas e sem repetir o mesmo atendimento.
 */
export function findAppointmentsInPeriod(params: {
  appointments: UsageAppointment[];
  serviceIds: string[];
  startDate: string;
  endDate: string;
  /** IDs já usados em outro registro de frasco — não podem ser contados de novo. */
  excludeAppointmentIds?: string[];
}): UsageAppointment[] {
  const { startDate, endDate } = params;
  if (!startDate || !endDate) return [];
  const services = new Set(params.serviceIds.filter(Boolean));
  const excluded = new Set(params.excludeAppointmentIds ?? []);
  const seen = new Set<string>();
  const result: UsageAppointment[] = [];

  for (const apt of params.appointments) {
    if (!apt?.id || seen.has(apt.id) || excluded.has(apt.id)) continue;
    if (services.size > 0 && (!apt.service_id || !services.has(apt.service_id))) continue;
    const status = (apt.status ?? '').toLowerCase();
    if (NON_CONSUMING_STATUSES.has(status)) continue;
    const key = dayKey(apt.start_time);
    if (!key || key < startDate || key > endDate) continue;
    seen.add(apt.id);
    result.push(apt);
  }

  return result.sort((a, b) => a.start_time.localeCompare(b.start_time));
}

export interface UsageResult {
  mode: UsageCalcMode;
  /** Quantidade do frasco na unidade informada. */
  containerAmount: number;
  containerUnit: string;
  /** Consumo por atendimento na unidade do frasco. */
  perAppointment: number | null;
  /** True quando o consumo foi estimado pela média do frasco. */
  isEstimated: boolean;
  /** Atendimentos considerados no período (modo automático). */
  appointmentsCounted: number;
  /** Quantos atendimentos o frasco rende. */
  containerYield: number | null;
  /** Quanto foi consumido no período. */
  totalConsumed: number | null;
  /** Atendimentos possíveis com o estoque total. */
  totalStockAppointments: number | null;
  /** Frascos equivalentes no estoque total. */
  containersInStock: number | null;
}

/**
 * Calcula o resultado dos dois modos de uma só vez, sem misturar entradas.
 * No modo 'manual' o `perAppointment` informado é a fonte oficial.
 * No modo 'auto' o `perAppointment` é a média (frasco ÷ atendimentos).
 */
export function computeUsage(params: {
  mode: UsageCalcMode;
  containerAmount: number;
  containerUnit: string;
  /** Obrigatório no modo manual, ignorado no modo automático. */
  quantityPerAppointment?: number | null;
  /** Unidade do consumo informado (modo manual). */
  quantityUnit?: string | null;
  appointmentsCounted?: number;
  stockQuantity?: number;
  stockUnit?: string;
}): UsageResult {
  const containerAmount = Number(params.containerAmount) || 0;
  const containerUnit = params.containerUnit;
  const counted = Math.max(0, Number(params.appointmentsCounted) || 0);

  let perAppointment: number | null = null;
  let isEstimated = false;

  if (params.mode === 'manual') {
    const raw = Number(params.quantityPerAppointment) || 0;
    perAppointment = raw > 0 ? convertWithinFamily(raw, params.quantityUnit ?? containerUnit, containerUnit) : null;
  } else {
    isEstimated = true;
    perAppointment = counted > 0 && containerAmount > 0 ? containerAmount / counted : null;
  }

  const containerYield =
    perAppointment && perAppointment > 0 && containerAmount > 0
      ? Math.floor(containerAmount / perAppointment)
      : null;

  const totalConsumed =
    params.mode === 'manual'
      ? perAppointment && counted > 0
        ? perAppointment * counted
        : null
      : containerAmount > 0 && counted > 0
        ? containerAmount
        : null;

  const stockQuantity = Number(params.stockQuantity) || 0;
  const stockUnit = params.stockUnit || containerUnit;

  const totalStockAppointments =
    perAppointment && perAppointment > 0
      ? appointmentsFromQuantity({
          quantity: stockQuantity,
          quantityUnit: stockUnit,
          perAppointment,
          perAppointmentUnit: containerUnit,
        })
      : null;

  const containersInStock =
    containerAmount > 0
      ? containerEquivalents({ stockQuantity, stockUnit, containerAmount, containerUnit })
      : null;

  return {
    mode: params.mode,
    containerAmount,
    containerUnit,
    perAppointment,
    isEstimated,
    appointmentsCounted: counted,
    containerYield,
    totalConsumed,
    totalStockAppointments,
    containersInStock,
  };
}

export interface UsageValidationInput {
  mode: UsageCalcMode;
  containerAmount: number;
  containerUnit: string;
  quantityPerAppointment?: number | null;
  quantityUnit?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  serviceIds: string[];
  appointmentsCounted?: number;
  stockUnit?: string;
}

/** Mensagens de validação em português claro (vazio = pode salvar). */
export function validateUsage(input: UsageValidationInput): string[] {
  const errors: string[] = [];

  if (input.serviceIds.filter(Boolean).length === 0) {
    errors.push('Selecione ao menos um serviço para vincular ao produto.');
  }
  if (!(Number(input.containerAmount) > 0)) {
    errors.push('Informe a quantidade do frasco colocado em uso (maior que zero).');
  }
  if (input.stockUnit && getBaseUnit(input.containerUnit) !== getBaseUnit(input.stockUnit)) {
    errors.push('A unidade do frasco precisa ser da mesma família da unidade do estoque (massa com massa, volume com volume).');
  }
  if (!input.startDate || !input.endDate) {
    errors.push('Informe a data de início e a data de término do uso.');
  } else if (input.endDate < input.startDate) {
    errors.push('A data de término não pode ser anterior à data de início.');
  }

  if (input.mode === 'manual') {
    if (!(Number(input.quantityPerAppointment) > 0)) {
      errors.push('Informe a quantidade consumida por atendimento (maior que zero).');
    } else if (getBaseUnit(input.quantityUnit ?? input.containerUnit) !== getBaseUnit(input.containerUnit)) {
      errors.push('A unidade do consumo por atendimento precisa ser compatível com a unidade do frasco.');
    }
  } else if (!(Number(input.appointmentsCounted) > 0)) {
    errors.push('Não encontramos atendimentos válidos nesse período para esse serviço, então não é possível calcular o consumo médio.');
  }

  return errors;
}

export function formatQuantity(value: number | null | undefined, unit?: string | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace('.', ',');
  return unit ? `${text} ${unit}` : text;
}
