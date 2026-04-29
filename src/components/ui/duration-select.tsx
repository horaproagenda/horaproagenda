import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatDurationClock, parseDurationClock } from '@/lib/duration';

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
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) setDisplayValue(formatDurationClock(value));
  }, [value, isEditing]);

  const normalizeInput = (nextValue: string) => {
    const cleaned = nextValue.replace(/[^\d:]/g, '').slice(0, 5);
    const [hours = '', minutes = ''] = cleaned.split(':');
    if (cleaned.includes(':')) return `${hours.slice(0, 2)}:${minutes.slice(0, 2)}`;

    const digits = cleaned.replace(/\D/g, '').slice(0, 4);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}:${digits.slice(2)}`;
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
    setIsEditing(false);
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
          onFocus={() => setIsEditing(true)}
          onChange={(event) => {
            const nextValue = normalizeInput(event.target.value);
            setDisplayValue(nextValue);
            setError('');
          }}
          onBlur={() => {
            if (!validateAndCommit(displayValue)) setIsEditing(false);
          }}
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
