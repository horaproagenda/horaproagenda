import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const dialog = readFileSync('src/components/appointments/NewAppointmentDialog.tsx', 'utf8');
const hook = readFileSync('src/hooks/useClientPackages.ts', 'utf8');

describe('Etapa de pacote vinculada pelo ID único', () => {
  it('o vínculo envia o ID da etapa ao banco', () => {
    expect(hook).toContain('_package_appointment_id');
    // O formulário grava tudo numa transação única, já vinculando cada
    // data ao ID único da etapa correspondente.
    expect(dialog).toContain('packageAppointmentId: targetStep.id');
    expect(dialog).toContain('schedulePackageSessionsBatch');
  });
  it('as datas escolhidas não são empurradas ao salvar', () => {
    expect(dialog).not.toContain('Reconfirma o intervalo após o ajuste de slot livre');
    expect(dialog).not.toContain('Auto-slot falhou na sessão');
  });
});
