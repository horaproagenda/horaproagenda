import { convertQuantity, type StockUnit } from './productStock';

/**
 * Cálculos do "ciclo de uso por quantidade parcial".
 *
 * Exemplo real: comprei 600 unidades de palitos, coloquei 100 em uso e
 * registrei o início. Ao informar o término, o app calcula quantos
 * atendimentos foram feitos com as 100 unidades, a média por atendimento,
 * a duração em dias e a projeção para o total comprado / estoque restante.
 */

export interface CycleClosureInput {
  /** Quantidade colocada em uso no ciclo, na unidade do estoque (ex.: 100). */
  cycleQuantity: number;
  /** Atendimentos concluídos no período do ciclo. */
  appointments: number;
  /** Dias corridos do ciclo (início e término inclusive). */
  days: number;
}

export interface CycleClosureResult {
  /** Média de quantidade consumida por atendimento (ex.: 2,5 unidades). */
  avgQuantityPerAppointment: number | null;
  /** Média de atendimentos por dia no ciclo. */
  appointmentsPerDay: number | null;
  /** Dias de duração por unidade de estoque consumida. */
  daysPerUnit: number | null;
}

export function computeCycleClosure(input: CycleClosureInput): CycleClosureResult {
  const qty = Number(input.cycleQuantity) || 0;
  const apts = Number(input.appointments) || 0;
  const days = Number(input.days) || 0;

  return {
    avgQuantityPerAppointment: apts > 0 && qty > 0 ? qty / apts : null,
    appointmentsPerDay: days > 0 && apts > 0 ? apts / days : null,
    daysPerUnit: qty > 0 && days > 0 ? days / qty : null,
  };
}

export interface StockForecast {
  /** Atendimentos que o estoque informado ainda cobre. */
  remainingAppointments: number | null;
  /** Dias que o estoque informado ainda cobre. */
  remainingDays: number | null;
}

export function projectStockDuration(params: {
  stockQuantity: number;
  avgQuantityPerAppointment?: number | null;
  appointmentsPerDay?: number | null;
}): StockForecast {
  const stock = Number(params.stockQuantity) || 0;
  const avg = Number(params.avgQuantityPerAppointment) || 0;
  const perDay = Number(params.appointmentsPerDay) || 0;

  if (stock <= 0) return { remainingAppointments: 0, remainingDays: 0 };
  if (avg <= 0) return { remainingAppointments: null, remainingDays: null };

  const remainingAppointments = Math.floor(stock / avg);
  const remainingDays = perDay > 0 ? Math.floor(remainingAppointments / perDay) : null;

  return { remainingAppointments, remainingDays };
}

export interface HistoricCycle {
  cycle_quantity?: number | null;
  cycle_appointments?: number | null;
  avg_quantity_per_appointment?: number | null;
  started_using_at?: string | null;
  finished_at?: string | null;
}

/**
 * Média real do produto, ponderada pela quantidade de cada ciclo encerrado.
 * Usa apenas ciclos que têm quantidade em uso e atendimentos registrados.
 */
export function averageFromCycles(cycles: HistoricCycle[]): CycleClosureResult {
  let totalQty = 0;
  let totalApts = 0;
  let totalDays = 0;

  for (const c of cycles) {
    const qty = Number(c.cycle_quantity) || 0;
    const apts = Number(c.cycle_appointments) || 0;
    if (qty <= 0 || apts <= 0) continue;
    totalQty += qty;
    totalApts += apts;
    if (c.started_using_at && c.finished_at) {
      const start = new Date(c.started_using_at + 'T00:00:00').getTime();
      const end = new Date(c.finished_at + 'T00:00:00').getTime();
      const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
      if (Number.isFinite(days)) totalDays += days;
    }
  }

  return {
    avgQuantityPerAppointment: totalApts > 0 && totalQty > 0 ? totalQty / totalApts : null,
    appointmentsPerDay: totalDays > 0 && totalApts > 0 ? totalApts / totalDays : null,
    daysPerUnit: totalQty > 0 && totalDays > 0 ? totalDays / totalQty : null,
  };
}

/** Converte a quantidade do recipiente/uso para a unidade do estoque. */
export function toStockUnit(
  value: number,
  fromUnit: StockUnit | null | undefined,
  stockUnit: StockUnit | null | undefined,
): number {
  return convertQuantity(value, fromUnit, stockUnit) ?? value;
}

export function formatCycleQuantity(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace('.', ',');
}

/**
 * Mensagem de previsão em linguagem clara (sem termos técnicos).
 */
export function buildStockForecastMessage(params: {
  productName: string;
  unitLabel: string;
  stockQuantity: number;
  forecast: StockForecast;
  reorderDays?: number;
}): string | null {
  const { remainingAppointments, remainingDays } = params.forecast;
  if (remainingAppointments === null) return null;

  const parts = [`~${remainingAppointments} atendimento(s)`];
  if (remainingDays !== null) parts.push(`~${remainingDays} dia(s)`);

  const reorder = params.reorderDays ?? 14;
  const tail =
    remainingDays !== null && remainingDays <= reorder
      ? ' Compre mais agora para não faltar.'
      : remainingDays !== null
        ? ` Programe a compra quando faltar ${reorder} dia(s).`
        : '';

  return `${params.productName}: ${formatCycleQuantity(params.stockQuantity)} ${params.unitLabel} em estoque cobrem ${parts.join(' / ')}.${tail}`;
}
