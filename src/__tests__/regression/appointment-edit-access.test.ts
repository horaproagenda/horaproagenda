import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { canEditAppointment } from '@/lib/appointmentEditAccess';

const read = (p: string) => readFileSync(p, 'utf8');

describe('permissão de edição de agendamento', () => {
  it('administrador e recepção editam qualquer agendamento', () => {
    expect(canEditAppointment({ roles: ['admin'], appointment: { professional_id: 'p1' } })).toBe(true);
    expect(canEditAppointment({ roles: ['receptionist'], appointment: { professional_id: 'p1' } })).toBe(true);
  });

  it('profissional edita apenas os agendamentos que atende', () => {
    expect(
      canEditAppointment({ roles: ['professional'], professionalId: 'p1', appointment: { professional_id: 'p1' } }),
    ).toBe(true);
    expect(
      canEditAppointment({ roles: ['professional'], professionalId: 'p2', appointment: { professional_id: 'p1' } }),
    ).toBe(false);
  });

  it('sem papel reconhecido não edita', () => {
    expect(canEditAppointment({ roles: [], appointment: { professional_id: 'p1' } })).toBe(false);
    expect(canEditAppointment({ roles: null, appointment: null })).toBe(false);
  });
});

describe('botões de edição visíveis', () => {
  it('detalhes do agendamento mantém botão de editar com texto', () => {
    const src = read('src/components/appointments/AppointmentDetailDialog.tsx');
    expect(src).toContain('data-testid="appointment-edit-button"');
    expect(src).toContain('canEditAppointment(');
    expect(src).toMatch(/data-testid="appointment-edit-button"[\s\S]{0,400}Editar/);
  });

  it('perfil do cliente permite editar agendamento', () => {
    const tab = read('src/components/client-profile/ClientAppointmentsTab.tsx');
    expect(tab).toContain('data-testid="client-appointment-edit"');
    expect(tab).toContain('onEditAppointment');
    const page = read('src/pages/ClienteDetalhes.tsx');
    expect(page).toMatch(/ClientAppointmentsTab[\s\S]{0,400}onEditAppointment=\{setEditingAppointment\}/);
  });

  it('menu do cartão de agendamento não depende de passar o mouse', () => {
    const card = read('src/components/appointments/AppointmentCard.tsx');
    expect(card).not.toContain('opacity-0 group-hover:opacity-100');
  });

  it('tela inicial conecta a ação de editar', () => {
    const index = read('src/pages/Index.tsx');
    expect(index).toMatch(/<AppointmentCard[\s\S]{0,400}onEdit=/);
  });
});
