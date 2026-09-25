import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
const root = join(__dirname, '..', '..');
describe('agendamento manual e edição individual', () => {
  it('intervalo menor que o padrão não bloqueia o botão de salvar', () => {
    const s = readFileSync(join(root, 'components/appointments/NewAppointmentDialog.tsx'), 'utf8');
    expect(s).not.toMatch(/\|\| hasIntervalViolations \|\|/);
    expect(s).not.toContain('Corrija os intervalos');
  });
  it('editar um horário não recalcula as sessões seguintes automaticamente', () => {
    const s = readFileSync(join(root, 'hooks/useAppointments.ts'), 'utf8');
    expect(s).not.toContain("rpc('recalculate_package_minimum_intervals'");
  });
});
