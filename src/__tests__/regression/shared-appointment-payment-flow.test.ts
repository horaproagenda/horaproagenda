import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('fluxo único de agendamento entre Agenda e Perfil do Cliente', () => {
  it('Agenda e Perfil usam o mesmo fluxo de baixa de pagamento', () => {
    for (const f of ['src/pages/Agenda.tsx', 'src/pages/ClienteDetalhes.tsx']) {
      expect(readFileSync(f, 'utf8')).toContain('useAppointmentPaymentHandler(');
    }
    expect(readFileSync('src/pages/Agenda.tsx', 'utf8')).not.toMatch(/updatePayment\.mutate\(/);
  });
  it('Perfil abre a mesma janela de detalhes da Agenda', () => {
    expect(readFileSync('src/pages/ClienteDetalhes.tsx', 'utf8')).toContain('<AppointmentDetailDialog');
  });
});
