// Adjust a target date/time to fit within business hours and open days.
// - If day is closed, advances to the next open day, keeping desired time.
// - If time is before opening, snaps to opening.
// - If time is after closing minus duration, advances to next open day at opening.

export interface BusinessHoursConfig {
  opening_time: string; // 'HH:mm' or 'HH:mm:ss'
  closing_time: string;
  saturday_opening_time?: string | null;
  saturday_closing_time?: string | null;
  sunday_opening_time?: string | null;
  sunday_closing_time?: string | null;
  work_saturdays?: boolean | null;
  work_sundays?: boolean | null;
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.substring(0, 5).split(':').map(Number);
  return h * 60 + m;
};

export function getHoursForDay(date: Date, cfg: BusinessHoursConfig) {
  const day = date.getDay();
  if (day === 0) {
    return {
      isOpen: !!cfg.work_sundays,
      open: cfg.sunday_opening_time || cfg.opening_time,
      close: cfg.sunday_closing_time || cfg.closing_time,
    };
  }
  if (day === 6) {
    return {
      isOpen: !!cfg.work_saturdays,
      open: cfg.saturday_opening_time || cfg.opening_time,
      close: cfg.saturday_closing_time || cfg.closing_time,
    };
  }
  return { isOpen: true, open: cfg.opening_time, close: cfg.closing_time };
}

/**
 * Adjust desiredStart so it falls inside business hours of an open day,
 * and the appointment of `durationMs` fits before closing time.
 * Returns the adjusted start Date.
 */
export function adjustToBusinessHours(
  desiredStart: Date,
  durationMs: number,
  cfg: BusinessHoursConfig,
  maxDaysToAdvance = 14,
): Date {
  const candidate = new Date(desiredStart);

  for (let i = 0; i < maxDaysToAdvance; i += 1) {
    const hours = getHoursForDay(candidate, cfg);
    if (!hours.isOpen) {
      candidate.setDate(candidate.getDate() + 1);
      candidate.setHours(desiredStart.getHours(), desiredStart.getMinutes(), 0, 0);
      continue;
    }
    const openMin = toMinutes(hours.open);
    const closeMin = toMinutes(hours.close);
    const durMin = Math.round(durationMs / 60000);
    const curMin = candidate.getHours() * 60 + candidate.getMinutes();

    if (curMin < openMin) {
      candidate.setHours(Math.floor(openMin / 60), openMin % 60, 0, 0);
      return candidate;
    }
    if (curMin + durMin > closeMin) {
      // Advance to next day at opening
      candidate.setDate(candidate.getDate() + 1);
      candidate.setHours(Math.floor(openMin / 60), openMin % 60, 0, 0);
      continue;
    }
    return candidate;
  }
  return candidate;
}
