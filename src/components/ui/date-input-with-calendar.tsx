import * as React from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

interface DateInputWithCalendarProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> {
  value: string; // yyyy-MM-dd
  onChange: (value: string) => void;
  inputClassName?: string;
  triggerClassName?: string;
  popoverAlign?: 'start' | 'center' | 'end';
  buttonAriaLabel?: string;
}

/**
 * Reusable: native date input + small calendar popover side-by-side.
 * Using the calendar is optional; the native input remains fully editable.
 */
export function DateInputWithCalendar({
  value,
  onChange,
  inputClassName,
  triggerClassName,
  popoverAlign = 'start',
  buttonAriaLabel = 'Abrir calendário',
  disabled,
  ...inputProps
}: DateInputWithCalendarProps) {
  const selectedDate = React.useMemo(() => {
    if (!value) return undefined;
    try {
      const d = parseISO(`${value}T12:00:00`);
      return isValid(d) ? d : undefined;
    } catch {
      return undefined;
    }
  }, [value]);

  return (
    <div className="grid grid-cols-[1fr_auto] gap-2">
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn('min-w-0', inputClassName)}
        {...inputProps}
      />
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled}
            aria-label={buttonAriaLabel}
            className={cn('shrink-0', triggerClassName)}
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align={popoverAlign}>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(d) => d && onChange(format(d, 'yyyy-MM-dd'))}
            initialFocus
            className={cn('p-3 pointer-events-auto')}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
