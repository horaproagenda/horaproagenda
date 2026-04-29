import * as React from 'react';
import { Input } from '@/components/ui/input';
import { formatCurrencyInput, normalizeBrazilianCurrency, parseBrazilianCurrencyToCents } from '@/lib/utils';

interface CurrencyInputProps extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'onBlur'> {
  value: number | string | null | undefined;
  onValueChange: (value: number) => void;
  onCentsChange?: (cents: number) => void;
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onValueChange, onCentsChange, className, ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState(formatCurrencyInput(value));

    React.useEffect(() => {
      setDisplayValue(formatCurrencyInput(value));
    }, [value]);

    return (
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
        <Input
          ref={ref}
          inputMode="decimal"
          value={displayValue}
          onChange={(event) => {
            const nextValue = event.target.value.replace(/[^\d,.]/g, '');
            setDisplayValue(nextValue);
            const cents = parseBrazilianCurrencyToCents(nextValue);
            onCentsChange?.(cents);
            onValueChange(cents / 100);
          }}
          onBlur={() => {
            const normalizedValue = normalizeBrazilianCurrency(displayValue);
            onValueChange(normalizedValue);
            onCentsChange?.(Math.round(normalizedValue * 100));
            setDisplayValue(formatCurrencyInput(normalizedValue));
          }}
          className={className ? `pl-9 ${className}` : 'pl-9'}
          {...props}
        />
      </div>
    );
  },
);

CurrencyInput.displayName = 'CurrencyInput';