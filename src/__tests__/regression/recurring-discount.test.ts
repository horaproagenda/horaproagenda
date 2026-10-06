import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
const hook = readFileSync('src/hooks/useRecurringAppointments.ts', 'utf8');
const dialog = readFileSync('src/components/appointments/NewAppointmentDialog.tsx', 'utf8');
const appts = readFileSync('src/hooks/useAppointments.ts', 'utf8');
const fn = readFileSync('supabase/functions/create-appointment/index.ts', 'utf8');

describe('desconto gravado na criação do agendamento', () => {
  it('série envia desconto por sessão (todas ou só a 1ª)', () => {
    expect(hook).toMatch(/discount_amount: sessionDiscount\(i\)/);
    expect(hook).toMatch(/=== 'first' && i > 0 \? 0 : d/);
    expect(hook).not.toMatch(/updatePayload\.discount_amount/);
  });
  it('formulário não usa mais ajuste atrasado', () => {
    expect(dialog).not.toMatch(/update\(\{ discount_amount: discountValue \}\)/);
    expect(dialog).toMatch(/discount_scope: discountApplyToAll \? 'all' : 'first'/);
  });
  it('agendamento único envia desconto e a função grava sempre', () => {
    expect(appts).toMatch(/discount_amount: appointment\.discount_amount \?\? 0/);
    expect(fn).toMatch(/status: body\.status \|\| 'scheduled',\s*discount_amount: Math\.min/);
  });
});
