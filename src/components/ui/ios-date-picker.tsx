import * as React from 'react';
import { format, parse, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * IOSDatePicker
 * Seletor de data padronizado para toda a agenda — usa Popover + Calendar do
 * shadcn em vez do picker nativo do Android, garantindo UI idêntica em iOS,
 * Android (PWA / Capacitor) e desktop.
 *
 * Aceita/retorna string ISO "YYYY-MM-DD" para manter compatibilidade com os
 * <input type="date"> que substitui.
 */
export interface IOSDatePickerProps {
  value?: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  min?: string; // YYYY-MM-DD
  max?: string; // YYYY-MM-DD
  className?: string;
  id?: string;
}

export function IOSDatePicker({
  value,
  onChange,
  placeholder = 'Selecionar data',
  disabled,
  min,
  max,
  className,
  id,
}: IOSDatePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Append T12:00:00 to evitar offset de timezone (regra do projeto)
  const parsed = React.useMemo(() => {
    if (!value) return undefined;
    const d = new Date(`${value}T12:00:00`);
    return isValid(d) ? d : undefined;
  }, [value]);

  const minDate = min ? new Date(`${min}T12:00:00`) : undefined;
  const maxDate = max ? new Date(`${max}T12:00:00`) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-normal h-10 px-3',
            !parsed && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          <span className="tabular-nums">
            {parsed ? format(parsed, "dd/MM/yyyy", { locale: ptBR }) : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={ptBR}
          selected={parsed}
          onSelect={(d) => {
            if (!d) return;
            onChange(format(d, 'yyyy-MM-dd'));
            setOpen(false);
          }}
          disabled={(d) => {
            if (minDate && d < minDate) return true;
            if (maxDate && d > maxDate) return true;
            return false;
          }}
          initialFocus
          className={cn('p-3 pointer-events-auto')}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * IOSTimePicker
 * Seletor de hora estilo iOS (wheel) — listas verticais de horas/minutos
 * roláveis com snap. Idêntico em qualquer plataforma.
 * Aceita/retorna string "HH:mm".
 */
export interface IOSTimePickerProps {
  value?: string; // HH:mm
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minuteStep?: number; // default 5
  className?: string;
  id?: string;
}

export function IOSTimePicker({
  value,
  onChange,
  placeholder = '--:--',
  disabled,
  minuteStep = 5,
  className,
  id,
}: IOSTimePickerProps) {
  const [open, setOpen] = React.useState(false);

  const [h, m] = React.useMemo(() => {
    if (!value) return [null as number | null, null as number | null];
    const [hh, mm] = value.split(':').map(Number);
    return [isNaN(hh) ? null : hh, isNaN(mm) ? null : mm];
  }, [value]);

  const hours = React.useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = React.useMemo(
    () => Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep),
    [minuteStep],
  );

  const commit = (nh: number | null, nm: number | null) => {
    const fh = nh ?? h ?? 0;
    const fm = nm ?? m ?? 0;
    onChange(`${String(fh).padStart(2, '0')}:${String(fm).padStart(2, '0')}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-normal h-10 px-3 tabular-nums',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          {value || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="flex gap-2 h-48">
          <WheelColumn
            items={hours}
            selected={h}
            format={(n) => String(n).padStart(2, '0')}
            onSelect={(n) => commit(n, null)}
          />
          <div className="flex items-center text-lg font-semibold text-muted-foreground">:</div>
          <WheelColumn
            items={minutes}
            selected={m}
            format={(n) => String(n).padStart(2, '0')}
            onSelect={(n) => commit(null, n)}
          />
        </div>
        <div className="flex justify-end pt-2 border-t mt-2">
          <Button size="sm" onClick={() => setOpen(false)}>OK</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function WheelColumn({
  items,
  selected,
  format: fmt,
  onSelect,
}: {
  items: number[];
  selected: number | null;
  format: (n: number) => string;
  onSelect: (n: number) => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (selected == null || !ref.current) return;
    const el = ref.current.querySelector(`[data-val="${selected}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'center' });
  }, [selected]);

  return (
    <div
      ref={ref}
      className="h-full w-16 overflow-y-auto snap-y snap-mandatory px-1"
      style={{ scrollbarWidth: 'none' }}
    >
      <div className="h-16" />
      {items.map((n) => {
        const isSel = n === selected;
        return (
          <button
            key={n}
            type="button"
            data-val={n}
            onClick={() => onSelect(n)}
            className={cn(
              'w-full h-10 flex items-center justify-center snap-center rounded-md text-base tabular-nums transition-colors',
              isSel
                ? 'bg-primary text-primary-foreground font-semibold'
                : 'text-foreground/70 hover:bg-muted',
            )}
          >
            {fmt(n)}
          </button>
        );
      })}
      <div className="h-16" />
    </div>
  );
}
