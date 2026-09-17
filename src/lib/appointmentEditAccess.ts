import type { AppRole } from '@/types';

export interface AppointmentEditAccessInput {
  /** Papéis do usuário logado. */
  roles: AppRole[] | readonly AppRole[] | undefined | null;
  /** ID do cadastro de profissional vinculado ao usuário logado (quando houver). */
  professionalId?: string | null;
  /** Agendamento avaliado. */
  appointment?: {
    professional_id?: string | null;
    service?: { professional_id?: string | null } | null;
  } | null;
}

/**
 * Espelha a política de UPDATE de `appointments` no banco:
 * - Administrador e Recepção editam qualquer agendamento da conta.
 * - Profissional edita os agendamentos em que ele é o profissional responsável.
 *
 * Manter esta regra centralizada evita que a interface esconda o botão de
 * editar de quem tem permissão real de gravar.
 */
export function canEditAppointment({ roles, professionalId, appointment }: AppointmentEditAccessInput): boolean {
  const list = Array.from(roles ?? []);
  if (list.includes('admin') || list.includes('receptionist') || list.includes('super_admin')) {
    return true;
  }

  if (!list.includes('professional')) return false;
  if (!professionalId || !appointment) return false;

  const owner = appointment.professional_id || appointment.service?.professional_id || null;
  return !!owner && owner === professionalId;
}

/** Mensagem única exibida quando a edição é bloqueada por permissão. */
export const APPOINTMENT_EDIT_DENIED_MESSAGE =
  'Você não tem permissão para alterar este agendamento. Fale com o administrador da clínica.';
