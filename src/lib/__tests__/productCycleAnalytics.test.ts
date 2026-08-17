import { describe, expect, it } from 'vitest';
import {
  computeCycleClosure,
  projectStockDuration,
  averageFromCycles,
  buildStockForecastMessage,
} from '../productCycleAnalytics';

describe('Ciclo com quantidade parcial em uso (600 unidades, 100 em uso)', () => {
  it('calcula média por atendimento e ritmo diário', () => {
    const r = computeCycleClosure({ cycleQuantity: 100, appointments: 40, days: 20 });
    expect(r.avgQuantityPerAppointment).toBeCloseTo(2.5, 6);
    expect(r.appointmentsPerDay).toBeCloseTo(2, 6);
    expect(r.daysPerUnit).toBeCloseTo(0.2, 6);
  });

  it('sem atendimentos não inventa média', () => {
    const r = computeCycleClosure({ cycleQuantity: 100, appointments: 0, days: 10 });
    expect(r.avgQuantityPerAppointment).toBeNull();
  });

  it('projeta quantos atendimentos e dias o estoque restante cobre', () => {
    const f = projectStockDuration({
      stockQuantity: 500,
      avgQuantityPerAppointment: 2.5,
      appointmentsPerDay: 2,
    });
    expect(f.remainingAppointments).toBe(200);
    expect(f.remainingDays).toBe(100);
  });

  it('estoque zerado cobre nada', () => {
    expect(projectStockDuration({ stockQuantity: 0, avgQuantityPerAppointment: 2 })).toEqual({
      remainingAppointments: 0,
      remainingDays: 0,
    });
  });

  it('sem média histórica retorna projeção indefinida', () => {
    expect(projectStockDuration({ stockQuantity: 500 })).toEqual({
      remainingAppointments: null,
      remainingDays: null,
    });
  });
});

describe('Média ponderada de vários ciclos encerrados', () => {
  it('combina quantidades, atendimentos e dias', () => {
    const avg = averageFromCycles([
      { cycle_quantity: 100, cycle_appointments: 40, started_using_at: '2026-01-01', finished_at: '2026-01-20' },
      { cycle_quantity: 100, cycle_appointments: 60, started_using_at: '2026-02-01', finished_at: '2026-02-20' },
      { cycle_quantity: 0, cycle_appointments: 10 }, // ignorado
    ]);
    expect(avg.avgQuantityPerAppointment).toBeCloseTo(200 / 100, 6);
    expect(avg.appointmentsPerDay).toBeCloseTo(100 / 40, 6);
  });

  it('sem ciclos válidos retorna nulos', () => {
    expect(averageFromCycles([{ cycle_quantity: null, cycle_appointments: null }]).avgQuantityPerAppointment).toBeNull();
  });
});

describe('Mensagem de previsão em linguagem clara', () => {
  it('avisa para comprar agora quando faltam poucos dias', () => {
    const msg = buildStockForecastMessage({
      productName: 'Palitos',
      unitLabel: 'unidade(s)',
      stockQuantity: 20,
      forecast: { remainingAppointments: 8, remainingDays: 4 },
    });
    expect(msg).toContain('Palitos');
    expect(msg).toContain('~8 atendimento(s)');
    expect(msg).toContain('Compre mais agora');
  });

  it('não gera mensagem sem previsão', () => {
    expect(
      buildStockForecastMessage({
        productName: 'Palitos',
        unitLabel: 'unidade(s)',
        stockQuantity: 20,
        forecast: { remainingAppointments: null, remainingDays: null },
      }),
    ).toBeNull();
  });
});
