import { describe, expect, it } from 'vitest';
import { resolveSessionServiceLabel } from './packageStepLabel';

const services = [
  { id: 'svc-aval', name: 'Avaliação' },
  { id: 'svc-axila', name: 'Axila + Virilha' },
  { id: 'svc-generic', name: 'Depilação' },
];

describe('resolveSessionServiceLabel — Visualização das Sessões', () => {
  it('usa o nome do serviço da etapa quando cada passo tem service_id próprio', () => {
    const steps = [
      { service_id: 'svc-aval' },
      { service_id: 'svc-axila' },
      { service_id: 'svc-aval' },
    ];
    const pkg = { name: 'Axila + Virilha Completa', service_id: null };

    expect(resolveSessionServiceLabel({ index: 0, steps, services, pkg })).toBe('Avaliação');
    expect(resolveSessionServiceLabel({ index: 1, steps, services, pkg })).toBe('Axila + Virilha');
    expect(resolveSessionServiceLabel({ index: 2, steps, services, pkg })).toBe('Avaliação');
  });

  it('cai para o serviço do pacote quando a etapa não tem service_id', () => {
    const steps = [{ service_id: null }, { service_id: null }];
    const pkg = { name: 'Pacote X', service_id: 'svc-generic' };

    expect(resolveSessionServiceLabel({ index: 0, steps, services, pkg })).toBe('Depilação');
    expect(resolveSessionServiceLabel({ index: 1, steps, services, pkg })).toBe('Depilação');
  });

  it('usa nextStepService quando pacote e etapa não fornecem service_id', () => {
    const steps = [{ service_id: null }];
    const pkg = { name: 'Pacote Y', service_id: null };
    const label = resolveSessionServiceLabel({
      index: 0,
      steps,
      services,
      pkg,
      nextStepService: services[1],
    });
    expect(label).toBe('Axila + Virilha');
  });

  it('nunca retorna apenas o nome do pacote — usa "Sessão N · pacote" quando não há serviço', () => {
    const steps: { service_id: string | null }[] = [];
    const pkg = { name: 'Pacote Z', service_id: null };
    expect(resolveSessionServiceLabel({ index: 0, steps, services: [], pkg })).toBe('Sessão 1 · Pacote Z');
    expect(resolveSessionServiceLabel({ index: 2, steps, services: [], pkg })).toBe('Sessão 3 · Pacote Z');
  });
});
