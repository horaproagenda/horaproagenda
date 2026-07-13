import { test, expect } from '@playwright/test';
import { resolveSessionServiceLabel } from '../src/lib/packageStepLabel';
import { buildSequentialSchedule } from '../src/lib/sequentialPackageSchedule';

// E2E: ao EDITAR um agendamento de pacote sequencial (reordenar etapas, mudar
// horário de início e trocar o service_id de uma das etapas), os rótulos da
// Visualização das Sessões devem continuar refletindo exatamente o nome do
// serviço de cada etapa — nunca o nome do pacote nem "Sessão N".
test('edição de pacote sequencial: rótulos acompanham o service_id de cada etapa após alterações', () => {
  const services = [
    { id: 'svc-aval', name: 'Avaliação' },
    { id: 'svc-axila', name: 'Axila + Virilha' },
    { id: 'svc-perna', name: 'Perna Inteira' },
  ];
  const pkg = { name: 'Axila + Virilha Completa', service_id: null };

  // Estado inicial: Avaliação → Axila + Virilha → Avaliação
  let steps = [
    { service_id: 'svc-aval', interval_after_days: 3, duration_minutes: 30 },
    { service_id: 'svc-axila', interval_after_days: 4, duration_minutes: 30 },
    { service_id: 'svc-aval', interval_after_days: 0, duration_minutes: 30 },
  ];
  let schedule = buildSequentialSchedule({
    steps,
    services,
    pkg,
    startDate: '2026-07-20',
    startTime: '09:00',
  });
  expect(schedule.map((s) => s.label)).toEqual(['Avaliação', 'Axila + Virilha', 'Avaliação']);
  expect(schedule.map((s) => `${s.date} ${s.startTime}`)).toEqual([
    '2026-07-20 09:00',
    '2026-07-23 09:00',
    '2026-07-27 09:00',
  ]);

  // Edição 1: troca o service_id da 3ª etapa para Perna Inteira.
  steps = [
    { ...steps[0] },
    { ...steps[1] },
    { ...steps[2], service_id: 'svc-perna' },
  ];
  schedule = buildSequentialSchedule({
    steps,
    services,
    pkg,
    startDate: '2026-07-20',
    startTime: '09:00',
  });
  expect(schedule.map((s) => s.label)).toEqual(['Avaliação', 'Axila + Virilha', 'Perna Inteira']);

  // Edição 2: reordena (Axila → Avaliação → Perna) e muda horário para 13:00 (bug de fuso).
  steps = [
    { service_id: 'svc-axila', interval_after_days: 3, duration_minutes: 40 },
    { service_id: 'svc-aval', interval_after_days: 4, duration_minutes: 40 },
    { service_id: 'svc-perna', interval_after_days: 0, duration_minutes: 40 },
  ];
  schedule = buildSequentialSchedule({
    steps,
    services,
    pkg,
    startDate: '2026-07-20',
    startTime: '13:00',
  });
  expect(schedule.map((s) => s.label)).toEqual(['Axila + Virilha', 'Avaliação', 'Perna Inteira']);
  schedule.forEach((s) => {
    expect(s.endTime).toBe('13:40');
    expect(s.endTime).not.toBe('01:40');
    expect(s.label).not.toBe(pkg.name);
    expect(s.label).not.toMatch(/^Sessão\s+\d+/i);
  });

  // Sanidade: resolveSessionServiceLabel isolado devolve o mesmo rótulo para cada índice.
  steps.forEach((_, index) => {
    const label = resolveSessionServiceLabel({ index, steps, services, pkg });
    expect(label).toBe(schedule[index].label);
  });
});

test('NewAppointmentDialog: datas exibidas permanecem corretas e na ordem certa junto com o rótulo do serviço', () => {
  // Cenário do usuário: início 20/07 09:00, intervalos 3-4-3 dias, 4 etapas.
  const services = [
    { id: 'svc-aval', name: 'Avaliação' },
    { id: 'svc-axila', name: 'Axila + Virilha' },
  ];
  const pkg = { name: 'Axila + Virilha Completa', service_id: null };
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

  // Rótulos + datas exatamente como o usuário descreveu (20/07, 23/07, 27/07, 30/07 às 9h).
  const rendered = schedule.map((s) => ({
    label: s.label,
    dm: s.date.slice(8, 10) + '/' + s.date.slice(5, 7),
    time: s.startTime,
  }));

  expect(rendered).toEqual([
    { label: 'Avaliação', dm: '20/07', time: '09:00' },
    { label: 'Axila + Virilha', dm: '23/07', time: '09:00' },
    { label: 'Avaliação', dm: '27/07', time: '09:00' },
    { label: 'Axila + Virilha', dm: '30/07', time: '09:00' },
  ]);

  // Ordem estrita das datas — nada fora de sequência.
  for (let i = 1; i < schedule.length; i++) {
    expect(schedule[i].date > schedule[i - 1].date).toBe(true);
  }
});
