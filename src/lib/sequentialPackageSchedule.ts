// Utilitário puro para calcular as etapas do agendamento automático de um
// pacote sequencial. Retorna, para cada etapa, o rótulo do serviço, a data
// (YYYY-MM-DD), o horário de início e o horário de término — sem depender de
// fuso horário (usa apenas aritmética de calendário e "wall-clock").
import { addMinutesToClock } from './duration';
import { resolveSessionServiceLabel, type ServiceLike, type StepLike, type PackageLike } from './packageStepLabel';

export interface ScheduleStepInput extends StepLike {
  interval_after_days?: number | null;
  duration_minutes?: number | null;
}

export interface SequentialStepOutput {
  index: number;
  label: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

export interface BuildScheduleArgs {
  steps: ScheduleStepInput[];
  services: ServiceLike[];
  pkg: PackageLike | null;
  startDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  defaultDurationMinutes?: number;
  defaultIntervalDays?: number;
}

function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function buildSequentialSchedule({
  steps,
  services,
  pkg,
  startDate,
  startTime,
  defaultDurationMinutes = 60,
  defaultIntervalDays = 7,
}: BuildScheduleArgs): SequentialStepOutput[] {
  let currentDate = startDate;
  const out: SequentialStepOutput[] = [];

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    const label = resolveSessionServiceLabel({ index, steps, services, pkg });
    const duration = Number(step.duration_minutes ?? defaultDurationMinutes) || defaultDurationMinutes;

    if (index > 0) {
      const prev = steps[index - 1];
      const intervalDays = Number(prev?.interval_after_days ?? defaultIntervalDays) || defaultIntervalDays;
      currentDate = addDaysISO(currentDate, intervalDays);
    }

    out.push({
      index,
      label,
      date: currentDate,
      startTime,
      endTime: addMinutesToClock(startTime, duration),
    });
  }

  return out;
}
