// Pacote sequencial: cada etapa tem profissional, sala e equipamento próprios
// (package_template_steps.default_professional_id / default_room_id /
// default_equipment). No agendamento, a etapa manda; o formulário e o pacote
// só entram como reserva quando a etapa não tem o dado preenchido.

export interface SequentialStepDefaults {
  default_professional_id?: string | null;
  default_room_id?: string | null;
  default_equipment?: unknown;
}

export interface StepBookingResources {
  professionalId: string | null;
  roomId: string | null;
  equipmentId: string | null;
}

export function resolveStepBookingResources(
  step: SequentialStepDefaults | null | undefined,
  form: { professionalId?: string | null; roomId?: string | null; equipmentId?: string | null },
  pkg: { professional_id?: string | null; room_id?: string | null } | null | undefined,
): StepBookingResources {
  const stepEquipment = Array.isArray(step?.default_equipment) ? step.default_equipment : [];
  return {
    professionalId: step?.default_professional_id || form.professionalId || pkg?.professional_id || null,
    roomId: step?.default_room_id || form.roomId || pkg?.room_id || null,
    equipmentId: (stepEquipment[0] as string | undefined) || form.equipmentId || null,
  };
}
