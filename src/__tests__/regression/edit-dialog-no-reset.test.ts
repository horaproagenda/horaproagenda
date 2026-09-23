import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('EditRecurringAppointmentDialog não reseta data/hora em re-render', () => {
  const src = readFileSync(
    resolve(__dirname, '../../components/appointments/EditRecurringAppointmentDialog.tsx'),
    'utf8',
  );
  it('inicializa só ao abrir / trocar de agendamento', () => {
    expect(src).toContain('initializedKeyRef');
    expect(src).toContain('[open, appointment?.id]');
    expect(src).not.toMatch(/\}, \[appointment, rooms\]\);/);
  });
});
