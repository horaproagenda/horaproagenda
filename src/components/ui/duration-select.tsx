import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

function formatDurationClock(minutes: number): string {
  const safeMinutes = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

function parseDurationClock(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (mins > 59) return null;
  return hours * 60 + mins;
}

interface DurationSelectProps {
  value: number;
  onChange: (value: number) => void;
  minDuration?: number;
  maxDuration?: number;
  className?: string;
  placeholder?: string;
}

export function DurationSelect({
  value,
  onChange,
  minDuration = 5,
  maxDuration = 480,
  className,
  placeholder = '00:00',
}: DurationSelectProps) {
  const [displayValue, setDisplayValue] = useState(formatDurationClock(value));
  const [error, setError] = useState('');

  useEffect(() => {
    setDisplayValue(formatDurationClock(value));
  }, [value]);

  const normalizeInput = (nextValue: string) => {
    const digits = nextValue.replace(/\D/g, '').slice(0, 4);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, -2).padStart(2, '0')}:${digits.slice(-2)}`;
  };

  const validateAndCommit = (nextValue: string) => {
    const parsed = parseDurationClock(nextValue);

    if (parsed === null || parsed < minDuration || parsed > maxDuration) {
      setError(`Use 00:00 entre ${formatDurationClock(minDuration)} e ${formatDurationClock(maxDuration)}.`);
      setDisplayValue(formatDurationClock(value));
      return false;
    }

    onChange(parsed);
    setDisplayValue(formatDurationClock(parsed));
    setError('');
    return true;
  };

  return (
    <div className={cn('space-y-1', className)}>
      <div className="relative">
        <Clock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          inputMode="numeric"
          value={displayValue}
          placeholder={placeholder}
          onChange={(event) => {
            const nextValue = normalizeInput(event.target.value);
            setDisplayValue(nextValue);
            setError('');
            if (/^\d{2}:\d{2}$/.test(nextValue)) validateAndCommit(nextValue);
          }}
          onBlur={() => validateAndCommit(displayValue)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              validateAndCommit(displayValue);
            }
          }}
          className="h-8 pl-9 text-sm tabular-nums"
          aria-label="Duração em horas e minutos"
        />
      </div>
      {error && <p className="text-[10px] text-destructive">{error}</p>}
    </div>
  );
}
