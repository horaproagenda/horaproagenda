import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

/**
 * Uma única verificação de disponibilidade.
 *
 * A regra de conflito (profissional, sala, equipamento, ausência) vive somente
 * no banco (`appointment_conflict_reason`). As telas consultam essa regra via
 * `src/lib/availabilityCheck.ts`. Se alguma tela voltar a calcular conflito por
 * conta própria, a interface pode liberar um horário que o banco recusa.
 */
describe('verificação única de disponibilidade', () => {
  const newAppointment = read('src/components/appointments/NewAppointmentDialog.tsx');
  const editAppointment = read('src/components/client-profile/EditAppointmentDialog.tsx');
  const createFn = read('supabase/functions/create-appointment/index.ts');

  it('o formulário de novo agendamento usa a verificação compartilhada', () => {
    expect(newAppointment).toContain("from '@/lib/availabilityCheck'");
    expect(newAppointment).toContain('useAvailabilityCheck(');
  });

  it('o formulário de novo agendamento não recalcula conflito de recurso localmente', () => {
    expect(newAppointment).not.toContain('getAvailabilityConflictReason');
    expect(newAppointment).not.toContain('checkConflictsForDateTime');
  });

  it('a edição de agendamento usa a verificação compartilhada', () => {
    expect(editAppointment).toContain('checkAvailabilitySlot');
    expect(editAppointment).not.toContain('check_appointment_conflict');
  });

  it('a verificação do servidor vale sempre, inclusive no modo legacy', () => {
    expect(createFn).toContain('appointment_conflict_reason');
    expect(createFn).not.toContain('if (!body.legacy)');
  });

  it('a verificação compartilhada chama a função do banco', () => {
    const lib = read('src/lib/availabilityCheck.ts');
    expect(lib).toContain("supabase.rpc('appointment_conflict_reasons'");
  });
});
