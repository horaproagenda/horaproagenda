import { useMemo } from 'react';
import { isSameDay, addDays } from 'date-fns';

export interface Holiday {
  date: Date;
  name: string;
  type: 'national' | 'state' | 'municipal' | 'commemorative';
}

/**
 * Returns the date of the Nth occurrence of a given weekday in a month.
 * weekday: 0 = Sunday, 1 = Monday, ...
 */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const firstDay = new Date(year, month, 1);
  const offset = (weekday - firstDay.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

/**
 * Calculate Easter Sunday date for a given year using the Anonymous Gregorian algorithm
 * This is the basis for calculating moveable holidays
 */
function calculateEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed month
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  
  return new Date(year, month, day);
}

/**
 * Get all Brazilian national holidays for a given year
 * Includes both fixed and moveable holidays
 */
export function getBrazilianHolidays(year: number): Holiday[] {
  const easter = calculateEaster(year);
  
  // Fixed holidays (always on the same date)
  const fixedHolidays: Holiday[] = [
    { date: new Date(year, 0, 1), name: 'Confraternização Universal', type: 'national' },
    { date: new Date(year, 3, 21), name: 'Tiradentes', type: 'national' },
    { date: new Date(year, 4, 1), name: 'Dia do Trabalho', type: 'national' },
    { date: new Date(year, 8, 7), name: 'Independência do Brasil', type: 'national' },
    { date: new Date(year, 9, 12), name: 'Nossa Senhora Aparecida', type: 'national' },
    { date: new Date(year, 10, 2), name: 'Finados', type: 'national' },
    { date: new Date(year, 10, 15), name: 'Proclamação da República', type: 'national' },
    { date: new Date(year, 10, 20), name: 'Dia da Consciência Negra', type: 'national' },
    { date: new Date(year, 11, 25), name: 'Natal', type: 'national' },
  ];
  
  // Moveable holidays (based on Easter)
  const moveableHolidays: Holiday[] = [
    { date: addDays(easter, -47), name: 'Carnaval', type: 'national' }, // Terça de Carnaval
    { date: addDays(easter, -48), name: 'Carnaval', type: 'national' }, // Segunda de Carnaval
    { date: addDays(easter, -2), name: 'Sexta-feira Santa', type: 'national' },
    { date: easter, name: 'Páscoa', type: 'national' },
    { date: addDays(easter, 60), name: 'Corpus Christi', type: 'national' },
  ];

  // Datas comemorativas brasileiras (não são feriados oficiais, mas relevantes para agendamento)
  const commemorativeDates: Holiday[] = [
    { date: new Date(year, 2, 8), name: 'Dia Internacional da Mulher', type: 'commemorative' },
    { date: new Date(year, 2, 15), name: 'Dia do Consumidor', type: 'commemorative' },
    { date: new Date(year, 3, 22), name: 'Descobrimento do Brasil', type: 'commemorative' },
    { date: nthWeekdayOfMonth(year, 4, 0, 2), name: 'Dia das Mães', type: 'commemorative' }, // 2º domingo de maio
    { date: new Date(year, 5, 12), name: 'Dia dos Namorados', type: 'commemorative' },
    { date: new Date(year, 6, 20), name: 'Dia do Amigo', type: 'commemorative' },
    { date: new Date(year, 6, 26), name: 'Dia dos Avós', type: 'commemorative' },
    { date: nthWeekdayOfMonth(year, 7, 0, 2), name: 'Dia dos Pais', type: 'commemorative' }, // 2º domingo de agosto
    { date: new Date(year, 9, 12), name: 'Dia das Crianças', type: 'commemorative' },
    { date: new Date(year, 9, 15), name: 'Dia do Professor', type: 'commemorative' },
    { date: new Date(year, 10, 19), name: 'Black Friday (referência)', type: 'commemorative' },
  ];

  return [...fixedHolidays, ...moveableHolidays, ...commemorativeDates].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
}

/**
 * Check if a specific date is a holiday
 */
export function isHoliday(date: Date, holidays: Holiday[]): Holiday | undefined {
  return holidays.find(holiday => isSameDay(holiday.date, date));
}

/**
 * Hook to get holidays for the current year and optionally surrounding years
 */
export function useBrazilianHolidays(year?: number, includeAdjacentYears = true): {
  holidays: Holiday[];
  getHolidayForDate: (date: Date) => Holiday | undefined;
  isHolidayDate: (date: Date) => boolean;
} {
  const currentYear = year || new Date().getFullYear();
  
  const holidays = useMemo(() => {
    const yearsToInclude = includeAdjacentYears 
      ? [currentYear - 1, currentYear, currentYear + 1]
      : [currentYear];
    
    return yearsToInclude.flatMap(y => getBrazilianHolidays(y));
  }, [currentYear, includeAdjacentYears]);
  
  const getHolidayForDate = useMemo(() => {
    return (date: Date): Holiday | undefined => isHoliday(date, holidays);
  }, [holidays]);
  
  const isHolidayDate = useMemo(() => {
    return (date: Date): boolean => !!getHolidayForDate(date);
  }, [getHolidayForDate]);
  
  return { holidays, getHolidayForDate, isHolidayDate };
}
