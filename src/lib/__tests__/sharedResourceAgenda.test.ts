/**
 * Invariantes da exibição de recursos compartilhados na agenda.
 *
 * Regra protegida: quando o profissional pode "Ver agenda de outros
 * profissionais", ele vê na própria agenda os horários em que a MESMA sala,
 * equipamento ou recurso da clínica está ocupado por outro profissional —
 * sempre como bloqueio somente-leitura, sem dados clínicos nem financeiros.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SHARED_RESOURCE_PREFIX,
  isSharedResourceAppointment,
  mergeSharedResourceBookings,
  sharedResourceBackgroundColor,
  toSharedResourceAppointment,
} from '@/lib/sharedResourceAgenda';
import type { SharedResourceBooking } from '@/hooks/useSharedResourceBookings';
import type { Appointment } from '@/types';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const booking = (over: Partial<SharedResourceBooking> = {}): SharedResourceBooking => ({
  id: '11111111-1111-1111-1111-111111111111',
  resource_type: 'room',
  resource_id: '22222222-2222-2222-2222-222222222222',
  resource_name: 'Sala 1',
  start_time: '2026-09-01T13:00:00.000Z',
  end_time: '2026-09-01T14:00:00.000Z',
  status: 'scheduled',
  client_name: null,
  service_name: null,
  professional_name: 'Dra. Ana',
  professional_color: '#2f6fed',
  amount: null,
  notes: null,
  ...over,
});

const ownAppointment = (over: Partial<Appointment> = {}): Appointment =>
  ({
    id: '33333333-3333-3333-3333-333333333333',
    client_id: 'c1',
    service_id: null,
    professional_id: 'p1',
    room_id: null,
    package_appointment_id: null,
    recurring_group_id: null,
    start_time: '2026-09-01T15:00:00.000Z',
    end_time: '2026-09-01T16:00:00.000Z',
    status: 'scheduled',
    payment_status: 'pending',
    payment_methods: [],
    amount_paid: 0,
    notes: null,
    version: 1,
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-01T10:00:00.000Z',
    created_by: null,
    updated_by: null,
    ...over,
  }) as Appointment;

describe('recursos compartilhados na agenda', () => {
  it('marca a reserva como somente-leitura e com id próprio', () => {
    const item = toSharedResourceAppointment(booking());
    expect(item.id).toBe(`${SHARED_RESOURCE_PREFIX}${booking().id}`);
    expect(isSharedResourceAppointment(item)).toBe(true);
    expect(item.room_id).toBe(booking().resource_id);
  });

  it('não expõe valor nem cliente quando o Administrador não autorizou', () => {
    const item = toSharedResourceAppointment(booking());
    expect(item.service?.price).toBe(0);
    expect(item.amount_paid).toBe(0);
    expect(item.client?.name).toBe('Dra. Ana');
    expect(item.service?.name).toBe('');
    expect(item.notes).toBeNull();
    expect((item as any).shared_professional_color).toBe('#2f6fed');
  });

  it.each(['completed', 'cancelled', 'missed'])(
    'não exibe reservas com status encerrado: %s',
    (status) => {
      expect(mergeSharedResourceBookings([], [booking({ status })])).toHaveLength(0);
    },
  );

  it('deduplica a mesma reserva quando sala e equipamento coincidem', () => {
    const same = booking({ resource_type: 'equipment' });
    expect(mergeSharedResourceBookings([], [booking(), same])).toHaveLength(1);
  });

  it('usa a duração real da reserva para ocupar a grade', () => {
    const item = toSharedResourceAppointment(booking());
    expect(item.service?.duration).toBe(60);
  });

  it('agendamentos próprios nunca são tratados como recurso compartilhado', () => {
    expect(isSharedResourceAppointment(ownAppointment())).toBe(false);
  });

  it('mescla sem duplicar o que já está na agenda do profissional', () => {
    const own = ownAppointment({ id: booking().id });
    const merged = mergeSharedResourceBookings([own], [booking()]);
    expect(merged).toHaveLength(1);
    expect(isSharedResourceAppointment(merged[0])).toBe(false);
  });

  it('acrescenta a reserva de outro profissional ao que já existe', () => {
    const merged = mergeSharedResourceBookings([ownAppointment()], [booking()]);
    expect(merged).toHaveLength(2);
    expect(merged.filter(isSharedResourceAppointment)).toHaveLength(1);
  });

  it('sem reservas, devolve exatamente a mesma lista', () => {
    const list = [ownAppointment()];
    expect(mergeSharedResourceBookings(list, [])).toBe(list);
  });
});

describe('agenda protege ações sobre os bloqueios compartilhados', () => {
  const agenda = read('src/pages/Agenda.tsx');

  it('a grade desenha próprios + compartilhados e as estatísticas só os próprios', () => {
    expect(agenda).toContain('const displayedAppointments');
    expect(agenda).toContain('agendaAppointments.filter(matchesAgendaFilters)');
    expect(agenda).toContain('const dayApts = filteredByFilters.filter');
    expect(agenda).toMatch(/weekApts = filteredByFilters\.filter/);
    expect(agenda).toMatch(/monthApts = filteredByFilters\.filter/);
  });

  it('clicar ou arrastar um bloqueio compartilhado abre apenas o resumo seguro', () => {
    expect(agenda).toContain('if (isSharedResourceAppointment(appointment))');
    expect(agenda).toContain('setSharedResourceDialogOpen(true)');
    expect(agenda).toContain('<SharedResourceSummaryDialog');
    expect(agenda).toContain('if (!dragAndDropEnabled || isSharedResourceAppointment(apt)) return;');
    expect(agenda).toContain('draggable={!isSharedResource && dragAndDropEnabled}');
  });

  it('a mudança de agendamento revalida os bloqueios compartilhados em tempo real', () => {
    expect(read('src/hooks/useRealtimeSync.ts')).toContain("'shared-resource-bookings'");
  });
});
