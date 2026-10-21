/**
 * Etapas independentes de um kit de serviços. Cada etapa tem seus próprios
 * dados (nome, duração, valor, profissional, sala, equipamento) e não depende
 * de serviços avulsos cadastrados. O banco (validate_kit_steps) aplica as
 * mesmas regras; esta validação é apenas um aviso antecipado na tela.
 */
export interface KitStep {
  step_name: string;
  duration_minutes: number | null;
  price: number | null;
  professional_id: string;
  room_id: string;
  equipment: string[];
  interval_days: number;
  /** Legado: serviço avulso usado antes das etapas independentes. */
  service_id?: string;
}

export function emptyKitStep(isFirst: boolean): KitStep {
  return {
    step_name: '',
    duration_minutes: null,
    price: null,
    professional_id: '',
    room_id: '',
    equipment: [],
    interval_days: isFirst ? 0 : 7,
  };
}

export function normalizeKitSteps(raw: unknown): KitStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c: any, i) => ({
    step_name: String(c?.step_name ?? ''),
    duration_minutes: c?.duration_minutes != null && c.duration_minutes !== '' ? Number(c.duration_minutes) : null,
    price: c?.price != null && c.price !== '' ? Number(c.price) : null,
    professional_id: c?.professional_id ? String(c.professional_id) : '',
    room_id: c?.room_id ? String(c.room_id) : '',
    equipment: Array.isArray(c?.equipment) ? c.equipment.map(String) : [],
    interval_days: i === 0 ? 0 : Math.max(0, Number(c?.interval_days) || 0),
    ...(c?.service_id ? { service_id: String(c.service_id) } : {}),
  }));
}

export function validateKitSteps(steps: KitStep[], hasRooms: boolean): string | null {
  if (steps.length === 0) return 'Adicione pelo menos uma etapa ao kit.';
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const label = `Etapa ${i + 1}`;
    if (!s.step_name.trim()) return `${label}: informe o nome da etapa.`;
    if (s.duration_minutes == null || !Number.isFinite(s.duration_minutes) || s.duration_minutes < 5 || s.duration_minutes > 1440) {
      return `${label}: informe a duração (mínimo 5 minutos).`;
    }
    if (s.price == null || !Number.isFinite(s.price) || s.price < 0) return `${label}: informe o valor da etapa.`;
    if (!s.professional_id) return `${label}: selecione o profissional.`;
    if (hasRooms && !s.room_id) return `${label}: selecione a sala.`;
    if (!Number.isFinite(s.interval_days) || s.interval_days < 0 || s.interval_days > 365) {
      return `${label}: intervalo inválido (0 a 365 dias).`;
    }
  }
  return null;
}

export function kitTotalPrice(steps: KitStep[]): number {
  return steps.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
}

/** Converte para o formato gravado no banco (primeira etapa sempre intervalo 0). */
export function serializeKitSteps(steps: KitStep[]) {
  return steps.map((s, i) => ({
    step_name: s.step_name.trim(),
    duration_minutes: Number(s.duration_minutes),
    price: Number(s.price),
    professional_id: s.professional_id,
    room_id: s.room_id || null,
    equipment: s.equipment,
    interval_days: i === 0 ? 0 : s.interval_days,
  }));
}

/** Valor do atendimento: valor gravado da etapa do kit tem prioridade sobre o preço do serviço. */
export function appointmentBasePrice(apt: { price_snapshot?: number | null; service?: { price?: number | null } | null } | null | undefined): number {
  if (!apt) return 0;
  if (apt.price_snapshot != null) return Number(apt.price_snapshot) || 0;
  return Number(apt.service?.price) || 0;
}
