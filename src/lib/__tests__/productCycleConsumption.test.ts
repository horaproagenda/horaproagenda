import { describe, expect, it } from 'vitest';
import { distributeCycleConsumption, cycleConsumptionTag } from '../productCycleConsumption';

describe('distributeCycleConsumption', () => {
  const apts = [
    { id: 'a', start_time: '2026-09-01T10:00:00', service_id: 's1' },
    { id: 'b', start_time: '2026-09-02T10:00:00', service_id: 's1' },
    { id: 'c', start_time: '2026-09-03T10:00:00', service_id: 's2' },
  ];

  it('distribui a quantidade entre os atendimentos, cada um na sua data', () => {
    const entries = distributeCycleConsumption({ quantity: 90, appointments: apts, fallbackDate: '2026-09-03' });
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.consumption_date)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    expect(entries.every((e) => e.quantity_used === 30)).toBe(true);
  });

  it('a soma fecha exatamente com a quantidade informada', () => {
    const entries = distributeCycleConsumption({ quantity: 100, appointments: apts, fallbackDate: '2026-09-03' });
    const sum = entries.reduce((s, e) => s + e.quantity_used, 0);
    expect(Math.round(sum * 10000) / 10000).toBe(100);
  });

  it('sem atendimentos gera um único lançamento na data de término', () => {
    const entries = distributeCycleConsumption({ quantity: 100, appointments: [], fallbackDate: '2026-09-10' });
    expect(entries).toEqual([
      { appointment_id: null, service_id: null, consumption_date: '2026-09-10', quantity_used: 100 },
    ]);
  });

  it('quantidade zerada não gera lançamento', () => {
    expect(distributeCycleConsumption({ quantity: 0, appointments: apts, fallbackDate: '2026-09-10' })).toEqual([]);
  });

  it('a marca do ciclo permite substituir lançamentos sem duplicar', () => {
    expect(cycleConsumptionTag('abc')).toBe('[ciclo:abc]');
  });
});
