import { describe, expect, it } from 'vitest';
import {
  appointmentsFromQuantity,
  computeUsage,
  containerEquivalents,
  convertWithinFamily,
  findAppointmentsInPeriod,
  toBaseQuantity,
  validateUsage,
} from '../productUsageCalc';

const apt = (id: string, date: string, status = 'completed', service_id = 'svc-1') => ({
  id,
  service_id,
  start_time: `${date}T10:00:00`,
  status,
});

describe('conversão de unidades', () => {
  it('converte 25 kg para 25.000 g', () => {
    expect(toBaseQuantity(25, 'kg')).toBe(25000);
    expect(convertWithinFamily(25, 'kg', 'g')).toBe(25000);
  });

  it('converte 1 L para 1.000 ml', () => {
    expect(convertWithinFamily(1, 'l', 'ml')).toBe(1000);
  });

  it('não converte entre famílias diferentes', () => {
    expect(convertWithinFamily(1, 'kg', 'ml')).toBeNull();
  });
});

describe('frascos equivalentes', () => {
  it('estoque de 25 kg com frasco de 500 g → 50 frascos', () => {
    expect(
      containerEquivalents({ stockQuantity: 25, stockUnit: 'kg', containerAmount: 500, containerUnit: 'g' }),
    ).toBe(50);
  });
});

describe('modo manual (sei o consumo)', () => {
  it('frasco de 500 g com 100 g por atendimento rende 5 atendimentos', () => {
    const r = computeUsage({
      mode: 'manual',
      containerAmount: 500,
      containerUnit: 'g',
      quantityPerAppointment: 100,
      quantityUnit: 'g',
      appointmentsCounted: 5,
      stockQuantity: 25,
      stockUnit: 'kg',
    });
    expect(r.containerYield).toBe(5);
    expect(r.perAppointment).toBe(100);
    expect(r.isEstimated).toBe(false);
  });

  it('estoque de 25.000 g com 100 g por atendimento → 250 atendimentos', () => {
    expect(
      appointmentsFromQuantity({ quantity: 25000, quantityUnit: 'g', perAppointment: 100, perAppointmentUnit: 'g' }),
    ).toBe(250);
    const r = computeUsage({
      mode: 'manual',
      containerAmount: 500,
      containerUnit: 'g',
      quantityPerAppointment: 100,
      quantityUnit: 'g',
      appointmentsCounted: 5,
      stockQuantity: 25000,
      stockUnit: 'g',
    });
    expect(r.totalStockAppointments).toBe(250);
    expect(r.totalConsumed).toBe(500);
  });
});

describe('modo automático (não sei o consumo)', () => {
  it('frasco de 500 g com 5 atendimentos → média de 100 g', () => {
    const r = computeUsage({
      mode: 'auto',
      containerAmount: 500,
      containerUnit: 'g',
      appointmentsCounted: 5,
      stockQuantity: 25,
      stockUnit: 'kg',
    });
    expect(r.perAppointment).toBe(100);
    expect(r.containerYield).toBe(5);
    expect(r.isEstimated).toBe(true);
    expect(r.totalStockAppointments).toBe(250);
    expect(r.containersInStock).toBe(50);
  });

  it('frasco de 500 g com 10 atendimentos → média de 50 g', () => {
    const r = computeUsage({ mode: 'auto', containerAmount: 500, containerUnit: 'g', appointmentsCounted: 10 });
    expect(r.perAppointment).toBe(50);
  });

  it('sem atendimentos não calcula e a validação avisa', () => {
    const r = computeUsage({ mode: 'auto', containerAmount: 500, containerUnit: 'g', appointmentsCounted: 0 });
    expect(r.perAppointment).toBeNull();
    const errors = validateUsage({
      mode: 'auto',
      containerAmount: 500,
      containerUnit: 'g',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      serviceIds: ['svc-1'],
      appointmentsCounted: 0,
    });
    expect(errors.join(' ')).toContain('não é possível calcular o consumo médio');
  });
});

describe('validações', () => {
  it('bloqueia término anterior ao início', () => {
    const errors = validateUsage({
      mode: 'manual',
      containerAmount: 500,
      containerUnit: 'g',
      quantityPerAppointment: 100,
      quantityUnit: 'g',
      startDate: '2026-08-10',
      endDate: '2026-08-01',
      serviceIds: ['svc-1'],
      appointmentsCounted: 1,
    });
    expect(errors.join(' ')).toContain('não pode ser anterior');
  });

  it('exige consumo por atendimento só no modo manual', () => {
    const manual = validateUsage({
      mode: 'manual',
      containerAmount: 500,
      containerUnit: 'g',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      serviceIds: ['svc-1'],
    });
    expect(manual.join(' ')).toContain('quantidade consumida por atendimento');

    const auto = validateUsage({
      mode: 'auto',
      containerAmount: 500,
      containerUnit: 'g',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      serviceIds: ['svc-1'],
      appointmentsCounted: 3,
    });
    expect(auto).toEqual([]);
  });

  it('bloqueia frasco zerado, sem serviço, sem datas e unidade incompatível', () => {
    const errors = validateUsage({
      mode: 'auto',
      containerAmount: 0,
      containerUnit: 'ml',
      serviceIds: [],
      stockUnit: 'kg',
      appointmentsCounted: 2,
    });
    expect(errors.length).toBeGreaterThanOrEqual(4);
  });
});

describe('contagem de atendimentos do período', () => {
  const appointments = [
    apt('a1', '2026-08-01'),
    apt('a2', '2026-08-15'),
    apt('a3', '2026-08-31'),
    apt('a4', '2026-07-31'),
    apt('a5', '2026-09-01'),
    apt('a6', '2026-08-10', 'cancelled'),
    apt('a7', '2026-08-11', 'completed', 'svc-2'),
    apt('a1', '2026-08-01'),
  ];

  it('inclui as datas limite e ignora fora do período, cancelados, outros serviços e duplicados', () => {
    const found = findAppointmentsInPeriod({
      appointments,
      serviceIds: ['svc-1'],
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });
    expect(found.map((a) => a.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('não conta o mesmo atendimento em dois registros de frasco', () => {
    const first = findAppointmentsInPeriod({
      appointments,
      serviceIds: ['svc-1'],
      startDate: '2026-08-01',
      endDate: '2026-08-15',
    });
    const second = findAppointmentsInPeriod({
      appointments,
      serviceIds: ['svc-1'],
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      excludeAppointmentIds: first.map((a) => a.id),
    });
    expect(first.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(second.map((a) => a.id)).toEqual(['a3']);
  });
});

describe('regressão: unidade "Outros"', () => {
  it('converte dentro da própria família e não zera o consumo informado', () => {
    expect(convertWithinFamily(3, 'other', 'other')).toBe(3);
    expect(convertWithinFamily(3, 'other', 'g')).toBeNull();

    const usage = computeUsage({
      mode: 'manual',
      containerAmount: 100,
      containerUnit: 'other',
      quantityPerAppointment: 3,
      quantityUnit: 'other',
      appointmentsCounted: 5,
      stockQuantity: 600,
      stockUnit: 'other',
    });
    expect(usage.perAppointment).toBe(3);
    expect(usage.totalConsumed).toBe(15);
    expect(usage.containerYield).toBe(33);
  });

  it('não gera erro de validação para produto em "Outros"', () => {
    expect(
      validateUsage({
        mode: 'manual',
        containerAmount: 100,
        containerUnit: 'other',
        quantityPerAppointment: 3,
        quantityUnit: 'other',
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        serviceIds: ['svc-1'],
        appointmentsCounted: 5,
        stockUnit: 'other',
      }),
    ).toEqual([]);
  });
});
