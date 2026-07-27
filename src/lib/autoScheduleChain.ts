// Utilitários puros para manter a "corrente" de datas do agendamento
// automático de pacotes sempre respeitando o intervalo de dias configurado.
//
// Regras centrais:
// - o intervalo entre a sessão i e a i+1 é o `interval_after_days` da etapa i
//   quando for um número > 0; caso contrário cai para o intervalo do pacote e,
//   por fim, para o padrão (7 dias);
// - ajustes (dia útil, feriado, dia da semana preferido, conflito) só podem
//   EMPURRAR datas para frente — nunca reduzir o intervalo;
// - alterar uma data (manualmente ou resolvendo conflito) reencadeia todas as
//   datas posteriores.

const DAY_MS = 86_400_000;

export interface ChainOptions {
  /** intervals[i] = dias entre a sessão i e a sessão i+1 */
  intervals: number[];
  /** true quando a data é um dia permitido (dia útil / dia trabalhado) */
  isAllowedDay?: (date: Date) => boolean;
  /** 0-6 quando o usuário fixou um dia da semana */
  preferredDayOfWeek?: number | null;
  /** aplica o horário preferido (respeitando fuso) na data calculada */
  applyTime?: (date: Date) => Date;
}

export function addDaysKeepingTime(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

export function calendarDayDiff(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / DAY_MS);
}

/**
 * Intervalo efetivo entre duas etapas. `0`, `null`, `undefined` e valores
 * inválidos NUNCA viram 1 dia: caem para o intervalo do pacote.
 */
export function resolveStepInterval(
  stepIntervalAfterDays: number | null | undefined,
  packageIntervalDays: number | null | undefined,
  fallbackDays = 7,
): number {
  const step = Number(stepIntervalAfterDays);
  if (Number.isFinite(step) && step > 0) return Math.floor(step);

  const pkg = Number(packageIntervalDays);
  if (Number.isFinite(pkg) && pkg > 0) return Math.floor(pkg);

  const fallback = Number(fallbackDays);
  return Number.isFinite(fallback) && fallback > 0 ? Math.floor(fallback) : 7;
}

function normalizeInterval(value: number | undefined, fallback = 7): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Próxima data da corrente, empurrando para frente até um dia permitido. */
export function nextChainDate(previous: Date, intervalDays: number, options: ChainOptions = { intervals: [] }): Date {
  const { isAllowedDay, preferredDayOfWeek, applyTime } = options;
  let candidate = addDaysKeepingTime(previous, normalizeInterval(intervalDays));

  let guard = 0;
  while (guard++ < 400) {
    const weekdayOk = preferredDayOfWeek === null || preferredDayOfWeek === undefined
      ? true
      : candidate.getDay() === preferredDayOfWeek;
    const dayOk = isAllowedDay ? isAllowedDay(candidate) : true;
    if (weekdayOk && dayOk) break;
    candidate = addDaysKeepingTime(candidate, 1);
  }

  return applyTime ? applyTime(candidate) : candidate;
}

/** Reencadeia todas as datas posteriores ao índice alterado. */
export function rebuildChainFromIndex(
  dates: Date[],
  index: number,
  newDate: Date,
  options: ChainOptions,
): Date[] {
  if (index < 0 || index >= dates.length) return dates;

  const next = dates.map((d) => new Date(d.getTime()));
  next[index] = new Date(newDate.getTime());

  for (let i = index + 1; i < next.length; i++) {
    next[i] = nextChainDate(next[i - 1], options.intervals[i - 1], options);
  }

  return next;
}

/** Índices cujo gap em relação à sessão anterior é menor que o configurado. */
export function findChainViolations(dates: Date[], intervals: number[]): number[] {
  const violations: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const required = normalizeInterval(intervals[i - 1]);
    if (calendarDayDiff(dates[i - 1], dates[i]) < required) violations.push(i);
  }
  return violations;
}

/** Empurra apenas as datas que violam o intervalo mínimo, preservando o resto. */
export function enforceChainMinimums(dates: Date[], options: ChainOptions): Date[] {
  const next = dates.map((d) => new Date(d.getTime()));

  for (let i = 1; i < next.length; i++) {
    const required = normalizeInterval(options.intervals[i - 1]);
    if (calendarDayDiff(next[i - 1], next[i]) >= required) continue;
    next[i] = nextChainDate(next[i - 1], required, options);
  }

  return next;
}
