import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const editDialog = read('src/components/appointments/EditRecurringAppointmentDialog.tsx');
const clientProfile = read('src/pages/ClienteDetalhes.tsx');

describe('edição de agendamento pelo perfil do cliente', () => {
  it('carrega, exibe e salva o status no formulário compartilhado', () => {
    expect(editDialog).toContain("setStatus(appointment.status)");
    expect(editDialog).toContain('data-testid="edit-appointment-status"');
    expect(editDialog).toContain('updates: { status }');
    expect(editDialog).toMatch(/room_id: roomId === 'none' \? null : roomId,\s+status: packageOutcomeMode \? undefined : status,/);
    expect(editDialog).toContain("rpc('set_appointment_status_with_package_mode'");
  });

  it('mantém Histórico Detalhado e Agenda ligados ao mesmo formulário', () => {
    expect(clientProfile).toContain('onEditAppointment={setEditingAppointment}');
    expect(clientProfile.match(/onEditAppointment=\{setEditingAppointment\}/g)).toHaveLength(2);
    expect(clientProfile).toContain('<EditRecurringAppointmentDialog');
  });
});

describe('símbolo de Créditos no perfil do cliente', () => {
  it('usa ícone com dimensões explícitas para não ser comprimido no Safari móvel', () => {
    const creditsTab = clientProfile.slice(
      clientProfile.indexOf('<TabsTrigger value="credits"'),
      clientProfile.indexOf('<TabsTrigger value="appointments"'),
    );
    expect(creditsTab).toContain('<CircleDollarSign');
    expect(creditsTab).toContain('size={16}');
    expect(creditsTab).toContain('min-h-4 min-w-4 flex-none');
  });
});