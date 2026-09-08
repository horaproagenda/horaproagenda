/**
 * Ciclo de uso → registros de consumo por data.
 *
 * Quando o profissional informa "separei 100 unidades", registra o início e
 * depois o término, a quantidade informada é distribuída entre os atendimentos
 * realizados no período, cada um na sua própria data. É isso que faz os
 * cartões Hoje / Semana / Mês / Semestre / Ano refletirem o ciclo.
 *
 * A soma dos registros fecha EXATAMENTE com a quantidade informada: a sobra de
 * arredondamento vai para o último atendimento.
 */

export interface CycleAppointmentRef {
  id: string;
  start_time: string;
  service_id?: string | null;
}

export interface CycleConsumptionEntry {
  appointment_id: string | null;
  service_id: string | null;
  consumption_date: string;
  quantity_used: number;
}

/** Marca que identifica os lançamentos de um ciclo (permite substituir sem duplicar). */
export function cycleConsumptionTag(cycleKey: string): string {
  return `[ciclo:${cycleKey}]`;
}

function dayKey(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const round4 = (v: number) => Math.round(v * 10000) / 10000;

/**
 * Distribui a quantidade do ciclo entre os atendimentos do período.
 * Sem atendimentos, gera um único lançamento na data de término — o produto
 * saiu do estoque de qualquer forma, e o consumo precisa aparecer.
 */
export function distributeCycleConsumption(params: {
  quantity: number;
  appointments: CycleAppointmentRef[];
  fallbackDate: string;
}): CycleConsumptionEntry[] {
  const quantity = Number(params.quantity) || 0;
  if (quantity <= 0) return [];

  const apts = (params.appointments ?? [])
    .filter((a) => a && a.id && dayKey(a.start_time))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  if (apts.length === 0) {
    const date = dayKey(params.fallbackDate);
    if (!date) return [];
    return [{ appointment_id: null, service_id: null, consumption_date: date, quantity_used: round4(quantity) }];
  }

  const per = round4(quantity / apts.length);
  const entries: CycleConsumptionEntry[] = apts.map((a) => ({
    appointment_id: a.id,
    service_id: a.service_id ?? null,
    consumption_date: dayKey(a.start_time),
    quantity_used: per,
  }));

  // Sobra de arredondamento no último lançamento: a soma fecha com o informado.
  const sum = entries.reduce((s, e) => s + e.quantity_used, 0);
  const diff = round4(quantity - sum);
  if (diff !== 0) {
    const last = entries[entries.length - 1];
    last.quantity_used = round4(last.quantity_used + diff);
  }

  return entries;
}
