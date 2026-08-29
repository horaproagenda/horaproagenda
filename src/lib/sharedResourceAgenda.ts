import { Appointment } from '@/types';
import { SharedResourceBooking, sharedResourceLabel } from '@/hooks/useSharedResourceBookings';

export const SHARED_RESOURCE_PREFIX = 'shared-resource-';

/** Cor neutra usada quando o profissional responsável não tem cor cadastrada. */
export const SHARED_RESOURCE_FALLBACK_COLOR = 'hsl(var(--muted-foreground))';

/** Status que ainda ocupam o recurso (atendimento em aberto). */
export const SHARED_RESOURCE_OPEN_STATUSES = [
  'pending',
  'scheduled',
  'confirmed',
  'in_progress',
  'rescheduled',
] as const;

/** Status que liberam o recurso e por isso nunca viram bloqueio compartilhado. */
export const SHARED_RESOURCE_CLOSED_STATUSES = ['completed', 'cancelled', 'missed'] as const;

export function isOpenSharedResourceStatus(status?: string | null): boolean {
  if (!status) return true;
  return !(SHARED_RESOURCE_CLOSED_STATUSES as readonly string[]).includes(status);
}

/** Marca aplicada aos itens somente-leitura de recursos compartilhados. */
export interface SharedResourceAppointment extends Appointment {
  is_shared_resource: true;
  shared_resource_type: 'room' | 'equipment';
  shared_resource_name: string | null;
  shared_professional_name: string | null;
  shared_professional_color: string;
}

export function isSharedResourceAppointment(apt: Appointment): boolean {
  return (apt as SharedResourceAppointment).is_shared_resource === true;
}

/** Cor da agenda do profissional responsável pelo bloqueio compartilhado. */
export function sharedResourceColor(apt: Appointment): string {
  return (
    (apt as SharedResourceAppointment).shared_professional_color ||
    SHARED_RESOURCE_FALLBACK_COLOR
  );
}

/**
 * Converte uma reserva de recurso compartilhado (sala ou equipamento) de outro
 * profissional em um item somente-leitura para aparecer na agenda de quem tem a
 * opção "Ver agenda de outros profissionais" ativada.
 *
 * Privacidade: só sobrevivem o nome do profissional, o horário e a cor da agenda
 * dele. Cliente, serviço, valor, pagamento e observações são descartados aqui.
 */
export function toSharedResourceAppointment(b: SharedResourceBooking): SharedResourceAppointment {
  const label = sharedResourceLabel(b);
  return {
    id: `${SHARED_RESOURCE_PREFIX}${b.id}`,
    client_id: '',
    service_id: null,
    professional_id: null,
    room_id: b.resource_type === 'room' ? b.resource_id : null,
    equipment_id: b.resource_type === 'equipment' ? b.resource_id : null,
    package_appointment_id: null,
    recurring_group_id: null,
    start_time: b.start_time,
    end_time: b.end_time,
    status: 'scheduled',
    payment_status: 'pending',
    payment_methods: [],
    amount_paid: 0,
    notes: null,
    version: 0,
    created_at: b.start_time,
    updated_at: b.start_time,
    created_by: null,
    updated_by: null,
    client: { name: label } as Appointment['client'],
    service: {
      name: 'Horário reservado',
      // Preço/duração neutros: o item é só um bloqueio visual do recurso.
      price: 0,
      duration: Math.max(
        15,
        Math.round((new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / 60000),
      ),
      room_id: b.resource_type === 'room' ? b.resource_id : null,
    } as unknown as Appointment['service'],

    is_shared_resource: true,
    shared_resource_type: b.resource_type,
    shared_resource_name: b.resource_name,
    shared_professional_name: b.professional_name,
    shared_professional_color: b.professional_color || SHARED_RESOURCE_FALLBACK_COLOR,
  };
}

/**
 * Junta os agendamentos próprios com as reservas de recursos compartilhados,
 * ignorando as que já vêm na lista (quem enxerga a agenda completa não vê duplicado)
 * e itens já finalizados (recurso liberado).
 */
export function mergeSharedResourceBookings(
  appointments: Appointment[],
  bookings: SharedResourceBooking[],
): Appointment[] {
  if (!bookings.length) return appointments;
  const existing = new Set(appointments.map((a) => a.id));
  const seen = new Set<string>();
  const extras = bookings
    .filter((b) => {
      if (existing.has(b.id) || seen.has(b.id)) return false;
      if (!isOpenSharedResourceStatus(b.status)) return false;
      seen.add(b.id);
      return true;
    })
    .map(toSharedResourceAppointment);
  return extras.length ? [...appointments, ...extras] : appointments;
}
