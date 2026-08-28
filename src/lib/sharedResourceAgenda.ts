import { Appointment } from '@/types';
import { SharedResourceBooking, sharedResourceLabel } from '@/hooks/useSharedResourceBookings';

export const SHARED_RESOURCE_PREFIX = 'shared-resource-';

/** Marca aplicada aos itens somente-leitura de recursos compartilhados. */
export interface SharedResourceAppointment extends Appointment {
  is_shared_resource: true;
  shared_resource_type: 'room' | 'equipment';
  shared_resource_name: string | null;
}

export function isSharedResourceAppointment(apt: Appointment): boolean {
  return (apt as SharedResourceAppointment).is_shared_resource === true;
}

/**
 * Converte uma reserva de recurso compartilhado (sala ou equipamento) de outro
 * profissional em um item somente-leitura para aparecer na agenda de quem tem a
 * opção "Ver agenda de outros profissionais" ativada.
 */
export function toSharedResourceAppointment(b: SharedResourceBooking): SharedResourceAppointment {
  const label = sharedResourceLabel(b);
  return {
    id: `${SHARED_RESOURCE_PREFIX}${b.id}`,
    client_id: '',
    service_id: null,
    professional_id: null,
    room_id: b.resource_type === 'room' ? b.resource_id : null,
    package_appointment_id: null,
    recurring_group_id: null,
    start_time: b.start_time,
    end_time: b.end_time,
    status: (b.status as Appointment['status']) || 'scheduled',
    payment_status: 'pending',
    payment_methods: [],
    amount_paid: 0,
    notes: b.notes,
    version: 0,
    created_at: b.start_time,
    updated_at: b.start_time,
    created_by: null,
    updated_by: null,
    client: { name: label } as Appointment['client'],
    service: {
      name: b.service_name || (b.resource_name ? `Recurso: ${b.resource_name}` : 'Recurso compartilhado'),
      room_id: b.resource_type === 'room' ? b.resource_id : null,
    } as unknown as Appointment['service'],
    is_shared_resource: true,
    shared_resource_type: b.resource_type,
    shared_resource_name: b.resource_name,
  };
}

/**
 * Junta os agendamentos próprios com as reservas de recursos compartilhados,
 * ignorando as que já vêm na lista (quem enxerga a agenda completa não vê duplicado).
 */
export function mergeSharedResourceBookings(
  appointments: Appointment[],
  bookings: SharedResourceBooking[],
): Appointment[] {
  if (!bookings.length) return appointments;
  const existing = new Set(appointments.map((a) => a.id));
  const extras = bookings
    .filter((b) => !existing.has(b.id))
    .map(toSharedResourceAppointment);
  return extras.length ? [...appointments, ...extras] : appointments;
}
