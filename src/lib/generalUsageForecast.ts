/** Previsão de duração para produtos de uso geral (sem vínculo com atendimentos). Datas sem horário (yyyy-MM-dd). */
const DAY = 86_400_000;
const toUtc = (d: string) => { const [y, m, dd] = d.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, dd); };

/** Dias inclusivos entre início e término (mesmo dia = 1). */
export function inclusiveDays(start: string, end: string): number {
  return Math.max(1, Math.round((toUtc(end) - toUtc(start)) / DAY) + 1);
}

/** Média (arredondada) das durações dos ciclos concluídos. */
export function averageCycleDays(cycles: { started_at?: string | null; finished_at?: string | null }[]): number | null {
  const d = cycles.filter(c => c.started_at && c.finished_at).map(c => inclusiveDays(c.started_at!, c.finished_at!));
  return d.length ? Math.round(d.reduce((a, b) => a + b, 0) / d.length) : null;
}

/** Duração usada para a previsão: a informada pelo profissional tem prioridade; senão, a calculada. */
export function effectiveDurationDays(expected: number | null | undefined, cycles: Parameters<typeof averageCycleDays>[0]) {
  if (expected && expected > 0) return { days: expected, source: 'informed' as const };
  const avg = averageCycleDays(cycles);
  return avg ? { days: avg, source: 'calculated' as const } : null;
}

/** Data prevista de término = início + duração − 1. */
export function forecastEndDate(start: string, days: number): string {
  return new Date(toUtc(start) + (days - 1) * DAY).toISOString().slice(0, 10);
}
