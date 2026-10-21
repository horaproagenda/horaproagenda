import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const read = (p: string) => readFileSync(path.resolve(__dirname, '../../', p), 'utf8');

describe('datas de sessões de pacote nunca mudam em cascata', () => {
  it('perfil do cliente não empurra sessões +1 dia em choque de horário', () => {
    expect(read('components/client-profile/EditAppointmentDialog.tsx')).not.toMatch(/autoResolveConflicts/);
  });

  it('reagendar sessão de pacote não propaga para as seguintes', () => {
    expect(read('components/appointments/EditRecurringAppointmentDialog.tsx')).not.toMatch(/propagate_type:\s*'package'/);
  });

  it('propagação do tipo pacote é recusada no ponto central', () => {
    const src = read('hooks/useRecurringAppointments.ts');
    expect(src).toMatch(/propagate_type === 'package'\) \{\s*\/\/[^\n]*\n\s*throw new Error/);
  });
});
