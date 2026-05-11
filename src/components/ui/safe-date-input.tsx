import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface SafeDateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value: string | null | undefined;
  onCommit: (value: string | null) => void;
  /** Min year accepted (defaults to 1900). */
  minYear?: number;
  /** Max year accepted (defaults to 2100). */
  maxYear?: number;
}

/**
 * <input type="date"> wrapper that only commits the value when it is fully valid
 * (YYYY-MM-DD with year inside [minYear, maxYear]). This prevents bugs where
 * typing "2026" persists "0020-04-27" mid-typing.
 */
export function SafeDateInput({
  value,
  onCommit,
  minYear = 1900,
  maxYear = 2100,
  className,
  ...rest
}: SafeDateInputProps) {
  const [local, setLocal] = React.useState<string>(value ?? '');

  React.useEffect(() => {
    setLocal(value ?? '');
  }, [value]);

  const isValid = (v: string): boolean => {
    if (!v) return true; // empty = clear
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return false;
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    if (y < minYear || y > maxYear) return false;
    if (mo < 1 || mo > 12) return false;
    if (d < 1 || d > 31) return false;
    return true;
  };

  const commit = (v: string) => {
    if (isValid(v)) {
      onCommit(v ? v : null);
    } else {
      // revert local to last valid prop value
      setLocal(value ?? '');
    }
  };

  return (
    <Input
      {...rest}
      type="date"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      min={`${minYear}-01-01`}
      max={`${maxYear}-12-31`}
      className={cn(className)}
    />
  );
}
