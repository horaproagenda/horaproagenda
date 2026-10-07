import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
const hook = readFileSync('src/hooks/useRecurringAppointments.ts', 'utf8');
describe('série repetida é tudo ou nada', () => {
  it('não cria em segundo plano às cegas', () => {
    expect(hook).not.toMatch(/setTimeout\(\(\) => \{\s*createAppointmentsInBackground/);
    expect(hook).toMatch(/return await createAppointmentsInBackground/);
  });
  it('desfaz sessões gravadas quando uma falha', () => {
    expect(hook).toMatch(/delete_appointment_cascade/);
    expect(hook).toMatch(/Nenhuma sessão foi salva/);
  });
  it('repete falhas transitórias (tempo esgotado)', () => {
    expect(hook).toMatch(/57014/);
  });
});
