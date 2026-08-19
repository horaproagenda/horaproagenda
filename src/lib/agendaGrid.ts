/**
 * Ferramentas de layout da agenda (semana/mês) com suporte a "Ocultar domingo".
 *
 * A semana começa na segunda-feira. Ao ocultar o domingo, cada linha do mês
 * perde exatamente uma célula (a última), então basta montar as semanas
 * completas (com preenchimento do mês anterior/posterior) e filtrar os
 * domingos: o alinhamento das colunas continua correto.
 *
 * As colunas são aplicadas por estilo inline (`gridTemplateColumns`) para
 * garantir o mesmo resultado em Android e iOS, sem depender de classes
 * dinâmicas do Tailwind.
 */
import { addDays, eachDayOfInterval, endOfMonth, getDay, startOfMonth, startOfWeek } from 'date-fns';

export const WEEKDAY_LABELS_FULL = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export function weekdayLabels(hideSunday: boolean): string[] {
  return hideSunday ? WEEKDAY_LABELS_FULL.slice(0, 6) : WEEKDAY_LABELS_FULL;
}

export function isSunday(date: Date): boolean {
  return getDay(date) === 0;
}

/** Dias visíveis de uma semana (segunda a domingo), respeitando ocultar domingo. */
export function buildWeekDays(reference: Date, hideSunday: boolean): Date[] {
  const start = startOfWeek(reference, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return hideSunday ? days.filter((d) => !isSunday(d)) : days;
}

/** Grade do mês em semanas completas (segunda→domingo), respeitando ocultar domingo. */
export function buildMonthGridDays(reference: Date, hideSunday: boolean): Date[] {
  const start = startOfMonth(reference);
  const end = endOfMonth(reference);
  const days = eachDayOfInterval({ start, end });

  const firstDow = getDay(start);
  const padStart = firstDow === 0 ? 6 : firstDow - 1;
  const prev = Array.from({ length: padStart }, (_, i) => addDays(start, -(padStart - i)));

  const lastDow = getDay(end);
  const padEnd = lastDow === 0 ? 0 : 7 - lastDow;
  const next = Array.from({ length: padEnd }, (_, i) => addDays(end, i + 1));

  const all = [...prev, ...days, ...next];
  return hideSunday ? all.filter((d) => !isSunday(d)) : all;
}

/** Colunas iguais para a grade do mês/semana. */
export function gridColumnsStyle(count: number): { gridTemplateColumns: string } {
  return { gridTemplateColumns: `repeat(${Math.max(count, 1)}, minmax(0, 1fr))` };
}

/** Colunas da visão semana no desktop: coluna de horário + dias visíveis. */
export function weekGridColumnsStyle(dayCount: number, timeColumnWidth = '2.5rem'): { gridTemplateColumns: string } {
  return { gridTemplateColumns: `${timeColumnWidth} repeat(${Math.max(dayCount, 1)}, minmax(0, 1fr))` };
}
