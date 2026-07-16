import { test, expect } from '@playwright/test';
import { buildSequentialSchedule } from '../src/lib/sequentialPackageSchedule';
import { getSchedulingDurationMinutes, addMinutesToClock, parseDurationClock } from '../src/lib/duration';

// E2E: agendamento automático de um pacote sequencial COMPLETO.
// Simula o fluxo do NewAppointmentDialog + create-appointment Edge Function:
// resolve a duração de cada etapa (com fallback contra durações agregadas
// tipo 760min), gera todas as datas/horários via buildSequentialSchedule e
// valida que TODOS os agendamentos ficam dentro do horário de funcionamento
// da clínica — sem nenhum erro de "fora do horário".
test('pacote sequencial completo: todos os agendamentos são gerados dentro do horário comercial', () => {
  // Horário de funcionamento da clínica (mesmo default usado no app).
  const BUSINESS_OPEN = '08:00';
  const BUSINESS_CLOSE = '20:00';
  const openMin = parseDurationClock(BUSINESS_OPEN)!;
  const closeMin = parseDurationClock(BUSINESS_CLOSE)!;

  // Serviços cadastrados — inclui um serviço "agregado" com duração de 760min
  // (bug real do banco) para garantir que o fallback impede o agendamento
  // de estourar o expediente.
  const services = [
    { id: 'svc-aval', name: 'Avaliação', duration: 30 },
    { id: 'svc-axila', name: 'Axila + Virilha', duration: 45 },
    { id: 'svc-perna', name: 'Perna Inteira', duration: 60 },
    {
      id: 'svc-aggregate',
      name: 'Axila + Virilha Completa (agregado)',
      duration: 760, // valor errado salvo no banco
      service_components: [{ service_id: 'svc-axila' }],
    },
  ];

  const pkg = { name: 'Axila + Virilha Completa', service_id: null };

  // Pacote sequencial completo: 6 etapas, intervalos variados.
  const steps = [
    { service_id: 'svc-aval', interval_after_days: 3, duration_minutes: 30 },
    { service_id: 'svc-axila', interval_after_days: 7, duration_minutes: 45 },
    { service_id: 'svc-aggregate', interval_after_days: 7, duration_minutes: null }, // resolve via fallback
    { service_id: 'svc-perna', interval_after_days: 10, duration_minutes: 60 },
    { service_id: 'svc-axila', interval_after_days: 14, duration_minutes: 45 },
    { service_id: 'svc-aval', interval_after_days: 0, duration_minutes: 30 },
  ];

  // Cada etapa recebe a duração resolvida (mesma lógica do dialog).
  const stepsWithDuration = steps.map((s, i) => {
    const svc = services.find((x) => x.id === s.service_id) || null;
    const resolved = s.duration_minutes ?? getSchedulingDurationMinutes(svc, services, 60, i);
    return { ...s, duration_minutes: resolved };
  });

  const schedule = buildSequentialSchedule({
    steps: stepsWithDuration,
    services,
    pkg,
    startDate: '2026-08-03', // segunda-feira
    startTime: '09:00',
  });

  // Deve gerar exatamente uma entrada por etapa — sem falhas silenciosas.
  expect(schedule).toHaveLength(steps.length);

  // Cada agendamento tem rótulo do serviço, data ISO, e horários coerentes.
  const seenIsoStamps = new Set<string>();
  schedule.forEach((s, i) => {
    // Rótulo válido e não genérico.
    expect(s.label).toBeTruthy();
    expect(s.label).not.toMatch(/^Sessão\s+\d+/i);
    expect(s.label).not.toBe(pkg.name);

    // Data ISO válida.
    expect(s.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Horários dentro do expediente.
    const startMin = parseDurationClock(s.startTime)!;
    const endMin = parseDurationClock(s.endTime)!;
    expect(startMin).toBeGreaterThanOrEqual(openMin);
    expect(endMin).toBeLessThanOrEqual(closeMin);
    expect(endMin).toBeGreaterThan(startMin);

    // Confere que endTime = startTime + duração da etapa.
    const expectedEnd = addMinutesToClock(s.startTime, stepsWithDuration[i].duration_minutes!);
    expect(s.endTime).toBe(expectedEnd);

    // Nenhuma etapa duplica data+hora (dois agendamentos no mesmo slot).
    const stamp = `${s.date} ${s.startTime}`;
    expect(seenIsoStamps.has(stamp)).toBe(false);
    seenIsoStamps.add(stamp);
  });

  // Ordem cronológica estrita.
  for (let i = 1; i < schedule.length; i++) {
    expect(schedule[i].date > schedule[i - 1].date).toBe(true);
  }

  // Intervalos respeitam interval_after_days de cada etapa anterior.
  for (let i = 1; i < schedule.length; i++) {
    const prev = new Date(schedule[i - 1].date + 'T00:00:00Z').getTime();
    const cur = new Date(schedule[i].date + 'T00:00:00Z').getTime();
    const diffDays = Math.round((cur - prev) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(Number(steps[i - 1].interval_after_days));
  }

  // Sanidade: a etapa que veio de um serviço agregado (760 min) NÃO deve
  // ter recebido a duração agregada — o fallback deve tê-la reduzido para
  // um valor cabível no expediente.
  const aggregateIndex = 2;
  expect(stepsWithDuration[aggregateIndex].duration_minutes).toBeLessThanOrEqual(8 * 60);
  const aggEndMin = parseDurationClock(schedule[aggregateIndex].endTime)!;
  expect(aggEndMin).toBeLessThanOrEqual(closeMin);
});
