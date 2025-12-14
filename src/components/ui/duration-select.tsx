import React, { useState } from 'react';
import { Clock, Edit2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// Durations: 10-60 min in 10 min increments, then 80, 100, 120, etc. in 20 min increments
const DURATION_OPTIONS = [
  { value: 10, label: '10 min' },
  { value: 20, label: '20 min' },
  { value: 30, label: '30 min' },
  { value: 40, label: '40 min' },
  { value: 50, label: '50 min' },
  { value: 60, label: '1 hora' },
  { value: 80, label: '1h 20min' },
  { value: 100, label: '1h 40min' },
  { value: 120, label: '2 horas' },
  { value: 140, label: '2h 20min' },
  { value: 160, label: '2h 40min' },
  { value: 180, label: '3 horas' },
  { value: 200, label: '3h 20min' },
  { value: 220, label: '3h 40min' },
  { value: 240, label: '4 horas' },
  { value: 300, label: '5 horas' },
  { value: 360, label: '6 horas' },
  { value: 420, label: '7 horas' },
  { value: 480, label: '8 horas' },
];

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return hours === 1 ? '1 hora' : `${hours} horas`;
  }
  return `${hours}h ${mins}min`;
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
  placeholder = 'Selecione a duração',
}: DurationSelectProps) {
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');

  const isStandardDuration = DURATION_OPTIONS.some(opt => opt.value === value);
  const displayValue = value ? formatDuration(value) : placeholder;

  const handleCustomSubmit = () => {
    const numValue = parseInt(customValue, 10);
    if (!isNaN(numValue) && numValue >= minDuration && numValue <= maxDuration) {
      onChange(numValue);
      setIsCustomOpen(false);
      setCustomValue('');
    }
  };

  return (
    <div className={cn('flex gap-2', className)}>
      <Select
        value={isStandardDuration ? value.toString() : 'custom'}
        onValueChange={(val) => {
          if (val === 'custom') {
            setIsCustomOpen(true);
          } else {
            onChange(parseInt(val, 10));
          }
        }}
      >
        <SelectTrigger className="flex-1">
          <Clock className="h-4 w-4 mr-2 text-muted-foreground" />
          <SelectValue placeholder={placeholder}>
            {displayValue}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {DURATION_OPTIONS.filter(opt => opt.value >= minDuration && opt.value <= maxDuration).map((option) => (
            <SelectItem key={option.value} value={option.value.toString()}>
              {option.label}
            </SelectItem>
          ))}
          <SelectItem value="custom">
            <span className="flex items-center gap-2">
              <Edit2 className="h-3 w-3" />
              Personalizado...
            </span>
          </SelectItem>
        </SelectContent>
      </Select>

      <Popover open={isCustomOpen} onOpenChange={setIsCustomOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            title="Editar duração personalizada"
          >
            <Edit2 className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="end">
          <div className="space-y-3">
            <p className="text-sm font-medium">Duração personalizada</p>
            <div className="flex gap-2">
              <Input
                type="number"
                min={minDuration}
                max={maxDuration}
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                placeholder="Minutos"
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCustomSubmit();
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                onClick={handleCustomSubmit}
              >
                OK
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Entre {minDuration} e {maxDuration} minutos
            </p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
