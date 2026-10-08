import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('Perfil do cliente usa os mesmos fluxos da Agenda', () => {
  it('cria agendamento pela mesma janela da Agenda, já com o cliente escolhido', () => {
    const page = read('src/pages/ClienteDetalhes.tsx');
    expect(page).toContain('<NewAppointmentDialog');
    expect(page).toContain('prefilledClient={{ id: client.id, name: client.name }}');
    const dialog = read('src/components/appointments/NewAppointmentDialog.tsx');
    expect(dialog).toContain('if (prefilledClient) setSelectedClient(prefilledClient.id);');
  });

  it('excluir no Histórico abre a janela de detalhes compartilhada', () => {
    const report = read('src/components/client-profile/ClientReportTab.tsx');
    expect(report).toContain('if (onOpenAppointment) { onOpenAppointment(appointment); return; }');
    const page = read('src/pages/ClienteDetalhes.tsx');
    expect(page.match(/onOpenAppointment=\{\(a\) => setDetailAppointmentId\(a\.id\)\}/g)?.length).toBe(2);
  });
});
