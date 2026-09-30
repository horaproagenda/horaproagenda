import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { clinicDateTime, formatTimeInTimeZone, formatDateInTimeZone } from '@/lib/timezone';

const files = [
  'src/components/appointments/EditRecurringAppointmentDialog.tsx',
  'src/components/client-profile/EditAppointmentDialog.tsx',
];

describe('edição de agendamento usa o fuso da clínica', () => {
  it('não monta data/hora com o fuso do aparelho', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toMatch(/new Date\(`\$\{date\}T\$\{\w+\}`\)/);
      expect(src).toContain('clinicDateTime(');
    }
  });
  it('14:00 em São Paulo continua 14:00 no mesmo dia', () => {
    const d = clinicDateTime('2026-10-05', '23:30', 'America/Sao_Paulo');
    expect(formatTimeInTimeZone(d, 'America/Sao_Paulo')).toBe('23:30');
    expect(formatDateInTimeZone(d, 'America/Sao_Paulo')).toBe('2026-10-05');
  });
});
