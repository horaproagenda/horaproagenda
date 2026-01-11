import { useMemo } from 'react';
import { isSameDay, addDays } from 'date-fns';

export interface Holiday {
  date: Date;
  name: string;
  type: 'national' | 'state' | 'municipal';
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
  
  return [...fixedHolidays, ...moveableHolidays].sort((a, b) => a.date.getTime() - b.date.getTime());
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
