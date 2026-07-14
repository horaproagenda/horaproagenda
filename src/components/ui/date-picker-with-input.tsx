import * as React from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format, isValid, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { parseLooseDateToISO } from '@/lib/dateInputPaste';

interface DatePickerWithInputProps {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  disabled?: (date: Date) => boolean;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  triggerClassName?: string;
  popoverAlign?: 'start' | 'center' | 'end';
  ariaLabel?: string;
  disableInput?: boolean;
}

/**
 * Date picker que permite digitação manual (dd/MM/yyyy) OU seleção pelo calendário.
 * Aceita colar em vários formatos (dd/mm/yyyy, dd-mm-yyyy, ddmmyyyy, yyyy-mm-dd, etc).
 */
export function DatePickerWithInput({
  value,
  onChange,
  disabled,
  placeholder = 'dd/mm/aaaa',
  className,
  inputClassName,
  triggerClassName,
  popoverAlign = 'start',
  ariaLabel = 'Selecionar data',
  disableInput,
}: DatePickerWithInputProps) {
  const [text, setText] = React.useState(value ? format(value, 'dd/MM/yyyy') : '');
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    setText(value ? format(value, 'dd/MM/yyyy') : '');
  }, [value]);

  const commit = (raw: string) => {
    if (!raw.trim()) {
      onChange(undefined);
      return;
    }
    const iso = parseLooseDateToISO(raw) ?? null;
    let parsed: Date | null = null;
    if (iso) {
      const d = new Date(`${iso}T12:00:00`);
      if (isValid(d)) parsed = d;
    } else {
      const d = parse(raw, 'dd/MM/yyyy', new Date());
      if (isValid(d)) parsed = d;
    }
    if (parsed) {
      if (disabled && disabled(parsed)) {
        setText(value ? format(value, 'dd/MM/yyyy') : '');
        return;
      }
      onChange(parsed);
    } else {
      setText(value ? format(value, 'dd/MM/yyyy') : '');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Máscara leve dd/MM/yyyy enquanto digita
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
    let masked = digits;
    if (digits.length > 4) masked = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length > 2) masked = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    setText(masked);
    if (digits.length === 8) commit(masked);
  };

  return (
    <div className={cn('grid grid-cols-[1fr_auto] gap-2', className)}>
      <Input
        inputMode="numeric"
        placeholder={placeholder}
        value={text}
        onChange={handleChange}
        onBlur={() => commit(text)}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData('text');
          const iso = parseLooseDateToISO(pasted);
          if (iso) {
            e.preventDefault();
            const d = new Date(`${iso}T12:00:00`);
            if (isValid(d)) {
              if (disabled && disabled(d)) return;
              onChange(d);
            }
          }
        }}
        disabled={disableInput}
        aria-label={ariaLabel}
        className={cn('min-w-0', inputClassName)}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Abrir calendário"
            className={cn('shrink-0', triggerClassName)}
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 z-50" align={popoverAlign}>
          <Calendar
            mode="single"
            selected={value}
            defaultMonth={value}
            onSelect={(d) => {
              if (d) onChange(d);
              setOpen(false);
            }}
            disabled={disabled}
            locale={ptBR}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
