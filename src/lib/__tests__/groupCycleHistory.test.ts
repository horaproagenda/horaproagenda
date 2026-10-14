import { describe, expect, it } from 'vitest';
import { groupCycleHistoryByDay } from '../groupCycleHistory';

const c = (id: string, day: string, qty: number) => ({ id, when: `${day}T12:00:00`, kind: 'Ciclo de uso', label: 'Ciclo de uso', qty });

describe('groupCycleHistoryByDay', () => {
  it('junta lançamentos do ciclo no mesmo dia sem mudar a soma', () => {
    const rows = groupCycleHistoryByDay([c('a', '2026-10-08', 0.1), c('b', '2026-10-08', 0.1), c('d', '2026-10-09', 0.1)]);
    expect(rows).toHaveLength(2);
    expect(rows[0].qty).toBe(0.2);
    expect(rows[0].label).toBe('Consumo do ciclo (2 atendimentos)');
  });
  it('não agrupa consumos manuais', () => {
    const m = { id: 'm', when: '2026-10-08T10:00:00', kind: 'Consumo', label: 'x', qty: 1 };
    expect(groupCycleHistoryByDay([m, { ...m, id: 'n' }])).toHaveLength(2);
  });
});
