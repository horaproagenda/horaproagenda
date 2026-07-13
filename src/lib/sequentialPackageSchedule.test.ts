import { describe, expect, it } from 'vitest';
import { buildSequentialSchedule } from './sequentialPackageSchedule';

const services = [
  { id: 'svc-aval', name: 'Avaliação' },
  { id: 'svc-axila', name: 'Axila + Virilha' },
  { id: 'svc-perna', name: 'Perna Inteira' },
  { id: 'svc-buco', name: 'Buço' },
  { id: 'svc-costas', name: 'Costas' },
  { id: 'svc-braco', name: 'Braço' },
];

const pkg = { name: 'Axila + Virilha Completa', service_id: null };

describe('buildSequentialSchedule', () => {
  it('preserva rótulo do serviço de cada etapa (nunca só o nome do pacote)', () => {
    const steps = [
      { service_id: 'svc-aval', interval_after_days: 3, duration_minutes: 30 },
      { service_id: 'svc-axila', interval_after_days: 4, duration_minutes: 30 },
      { service_id: 'svc-aval', interval_after_days: 3, duration_minutes: 30 },
      { service_id: 'svc-axila', interval_after_days: 0, duration_minutes: 30 },
    ];

    const schedule = buildSequentialSchedule({
      steps,
      services,
      pkg,
      startDate: '2026-07-20',
      startTime: '09:00',
    });

    expect(schedule.map((s) => s.label)).toEqual([
      'Avaliação',
      'Axila + Virilha',
      'Avaliação',
      'Axila + Virilha',
    ]);
    schedule.forEach((s) => expect(s.label).not.toBe(pkg.name));
  });

  it('gera datas na ordem crescente respeitando interval_after_days', () => {
    const steps = [
      { service_id: 'svc-aval', interval_after_days: 3, duration_minutes: 30 },
      { service_id: 'svc-axila', interval_after_days: 4, duration_minutes: 30 },
      { service_id: 'svc-aval', interval_after_days: 3, duration_minutes: 30 },
      { service_id: 'svc-axila', interval_after_days: 0, duration_minutes: 30 },
    ];

    const schedule = buildSequentialSchedule({
      steps,
      services,
      pkg,
      startDate: '2026-07-20', // segunda
      startTime: '09:00',
    });

    expect(schedule.map((s) => s.date)).toEqual([
      '2026-07-20',
      '2026-07-23',
      '2026-07-27',
      '2026-07-30',
    ]);
    expect(schedule.map((s) => s.startTime)).toEqual(['09:00', '09:00', '09:00', '09:00']);
    expect(schedule.map((s) => s.endTime)).toEqual(['09:30', '09:30', '09:30', '09:30']);

    // Datas estritamente crescentes.
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i].date > schedule[i - 1].date).toBe(true);
    }
  });

  it('calcula horário de término via wall-clock (13:00 + 40min = 13:40, nunca 01:40)', () => {
    const steps = [
      { service_id: 'svc-aval', interval_after_days: 7, duration_minutes: 40 },
      { service_id: 'svc-axila', interval_after_days: 0, duration_minutes: 40 },
    ];
    const schedule = buildSequentialSchedule({
      steps,
      services,
      pkg,
      startDate: '2026-07-20',
      startTime: '13:00',
    });
    expect(schedule[0].endTime).toBe('13:40');
    expect(schedule[1].endTime).toBe('13:40');
    // Nunca deve virar 01:40 (bug de fuso).
    schedule.forEach((s) => expect(s.endTime).not.toBe('01:40'));
  });

  it.each([2, 3, 4, 5, 6])('suporta pacote sequencial com %i etapas sem repetir o nome do pacote', (count) => {
    const pool = ['svc-aval', 'svc-axila', 'svc-perna', 'svc-buco', 'svc-costas', 'svc-braco'];
    const steps = Array.from({ length: count }, (_, i) => ({
      service_id: pool[i % pool.length],
      interval_after_days: 5,
      duration_minutes: 45,
    }));

    const schedule = buildSequentialSchedule({
      steps,
      services,
      pkg,
      startDate: '2026-07-20',
      startTime: '08:00',
    });

    expect(schedule).toHaveLength(count);
    schedule.forEach((s, i) => {
      const expectedName = services.find((sv) => sv.id === pool[i % pool.length])!.name;
      expect(s.label).toBe(expectedName);
      expect(s.label).not.toBe(pkg.name);
      expect(s.endTime).toBe('08:45');
    });

    // Datas em ordem crescente, sem colisão.
    const dates = schedule.map((s) => s.date);
    expect(new Set(dates).size).toBe(count);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] > dates[i - 1]).toBe(true);
    }
  });

  it('etapa sem service_id cai para o serviço geral do pacote em cada linha', () => {
    const steps = [
      { service_id: null, interval_after_days: 7, duration_minutes: 30 },
      { service_id: null, interval_after_days: 7, duration_minutes: 30 },
      { service_id: null, interval_after_days: 0, duration_minutes: 30 },
    ];
    const schedule = buildSequentialSchedule({
      steps,
      services,
      pkg: { name: 'Pacote Genérico', service_id: 'svc-perna' },
      startDate: '2026-07-20',
      startTime: '10:00',
    });
    expect(schedule.map((s) => s.label)).toEqual(['Perna Inteira', 'Perna Inteira', 'Perna Inteira']);
  });
});
