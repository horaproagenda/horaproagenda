import { test, expect } from '@playwright/test';
import { resolveSessionServiceLabel } from '../src/lib/packageStepLabel';

// E2E: no formulário "Novo Agendamento", ao selecionar um pacote sequencial
// com 3 etapas (Avaliação → Axila + Virilha → Avaliação), a Visualização das
// Sessões deve mostrar somente o nome do serviço da etapa correspondente —
// nunca só o nome do pacote e sem prefixar "Sessão 1/2/3".
test('pacote sequencial exibe o nome do serviço de cada etapa (Avaliação, Axila + Virilha, Avaliação)', () => {
  const services = [
    { id: 'svc-aval', name: 'Avaliação' },
    { id: 'svc-axila', name: 'Axila + Virilha' },
  ];
  const steps = [
    { service_id: 'svc-aval' },
    { service_id: 'svc-axila' },
    { service_id: 'svc-aval' },
  ];
  const pkg = { name: 'Axila + Virilha Completa', service_id: null };

  const labels = steps.map((_, index) =>
    resolveSessionServiceLabel({ index, steps, services, pkg }),
  );

  expect(labels).toEqual(['Avaliação', 'Axila + Virilha', 'Avaliação']);

  // Nenhum rótulo pode ser apenas o nome do pacote ou começar com "Sessão N".
  labels.forEach((label) => {
    expect(label).not.toBe(pkg.name);
    expect(label).not.toMatch(/^Sessão\s+\d+/i);
  });
});

test('etapa sem service_id cai para o serviço geral do pacote, nunca para "Sessão N · <pacote>"', () => {
  const services = [{ id: 'svc-generic', name: 'Depilação' }];
  const steps = [{ service_id: null }, { service_id: null }];
  const pkg = { name: 'Pacote Genérico', service_id: 'svc-generic' };

  const labels = steps.map((_, index) =>
    resolveSessionServiceLabel({ index, steps, services, pkg }),
  );

  expect(labels).toEqual(['Depilação', 'Depilação']);
  labels.forEach((label) => expect(label).not.toMatch(/Sessão\s+\d+/i));
});
