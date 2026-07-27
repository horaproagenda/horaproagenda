import { describe, expect, it } from 'vitest';
import {
  calendarDayDiff,
  enforceChainMinimums,
  findChainViolations,
  nextChainDate,
  rebuildChainFromIndex,
  resolveStepInterval,
} from '../autoScheduleChain';

const at = (iso: string) => new Date(`${iso}T10:00:00`);
const isBusinessDay = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6;

describe('resolveStepInterval', () => {
  it('usa o intervalo da etapa quando é maior que zero', () => {
    expect(resolveStepInterval(30, 7)).toBe(30);
  });

  it('cai para o intervalo do pacote quando a etapa é 0/null (nunca 1 dia)', () => {
    expect(resolveStepInterval(0, 30)).toBe(30);
    expect(resolveStepInterval(null, 30)).toBe(30);
    expect(resolveStepInterval(undefined, 30)).toBe(30);
    expect(resolveStepInterval(Number.NaN, 30)).toBe(30);
  });

  it('cai para o padrão quando nada é válido', () => {
    expect(resolveStepInterval(0, 0)).toBe(7);
  });
});

describe('nextChainDate', () => {
  it('mantém 30 dias exatos quando o dia é permitido', () => {
    const next = nextChainDate(at('2026-08-29'), 30, { intervals: [] });
    expect(calendarDayDiff(at('2026-08-29'), next)).toBe(30);
  });

  it('só empurra para frente ao pular dias não úteis', () => {
    const start = at('2026-08-31'); // segunda
    const next = nextChainDate(start, 5, { intervals: [], isAllowedDay: isBusinessDay });
    expect(calendarDayDiff(start, next)).toBeGreaterThanOrEqual(5);
    expect(isBusinessDay(next)).toBe(true);
  });
});

describe('rebuildChainFromIndex', () => {
  const intervals = [30, 30, 30];
  const base = [at('2026-08-01'), at('2026-08-31'), at('2026-09-30'), at('2026-10-30')];

  it('reencadeia as datas posteriores mantendo o intervalo de 30 dias', () => {
    const updated = rebuildChainFromIndex(base, 1, at('2026-08-29'), { intervals });
    expect(updated[1].toDateString()).toBe(at('2026-08-29').toDateString());
    expect(calendarDayDiff(updated[1], updated[2])).toBe(30);
    expect(calendarDayDiff(updated[2], updated[3])).toBe(30);
  });

  it('não altera as datas anteriores ao índice editado', () => {
    const updated = rebuildChainFromIndex(base, 2, at('2026-10-05'), { intervals });
    expect(updated[0].getTime()).toBe(base[0].getTime());
    expect(updated[1].getTime()).toBe(base[1].getTime());
  });
});

describe('série de serviços repetidos', () => {
  const intervals = [7, 7, 7, 7];
  const base = [at('2026-09-01'), at('2026-09-08'), at('2026-09-15'), at('2026-09-22'), at('2026-09-29')];

  it('editar a 2ª data reencadeia todas as seguintes mantendo o intervalo', () => {
    const updated = rebuildChainFromIndex(base, 1, at('2026-09-10'), { intervals });
    expect(updated[0].getTime()).toBe(base[0].getTime());
    expect(calendarDayDiff(updated[1], updated[2])).toBe(7);
    expect(calendarDayDiff(updated[2], updated[3])).toBe(7);
    expect(calendarDayDiff(updated[3], updated[4])).toBe(7);
  });

  it('respeita o dia da semana preferido ao reencadear', () => {
    const updated = rebuildChainFromIndex(base, 0, at('2026-09-02'), {
      intervals,
      preferredDayOfWeek: 3, // quarta
    });
    updated.slice(1).forEach((d) => expect(d.getDay()).toBe(3));
  });

  it('ajuste por dia útil nunca reduz o gap abaixo do intervalo', () => {
    const updated = rebuildChainFromIndex(base, 0, at('2026-09-04'), {
      intervals: [5, 5, 5, 5],
      isAllowedDay: isBusinessDay,
    });
    for (let i = 1; i < updated.length; i++) {
      expect(calendarDayDiff(updated[i - 1], updated[i])).toBeGreaterThanOrEqual(5);
      expect(isBusinessDay(updated[i])).toBe(true);
    }
  });
});

describe('findChainViolations / enforceChainMinimums', () => {
  it('detecta o caso 29/08 -> 30/08 com intervalo de 30 dias', () => {
    const dates = [at('2026-08-29'), at('2026-08-30')];
    expect(findChainViolations(dates, [30])).toEqual([1]);
  });

  it('corrige apenas as datas que violam o intervalo', () => {
    const dates = [at('2026-08-29'), at('2026-08-30'), at('2026-11-01')];
    const fixed = enforceChainMinimums(dates, { intervals: [30, 30] });
    expect(calendarDayDiff(fixed[0], fixed[1])).toBe(30);
    expect(findChainViolations(fixed, [30, 30])).toEqual([]);
  });

  it('ajuste de dia útil nunca reduz o gap abaixo do intervalo', () => {
    const dates = [at('2026-08-29'), at('2026-08-30'), at('2026-08-31')];
    const fixed = enforceChainMinimums(dates, { intervals: [30, 30], isAllowedDay: isBusinessDay });
    expect(calendarDayDiff(fixed[0], fixed[1])).toBeGreaterThanOrEqual(30);
    expect(calendarDayDiff(fixed[1], fixed[2])).toBeGreaterThanOrEqual(30);
    fixed.slice(1).forEach((d) => expect(isBusinessDay(d)).toBe(true));
  });
});
