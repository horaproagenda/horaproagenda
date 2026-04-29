import * as React from 'react';
import { Input } from '@/components/ui/input';
import { formatCurrencyInput, parseBrazilianCurrency } from '@/lib/utils';

interface CurrencyInputProps extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'onBlur'> {
  value: number | string | null | undefined;
  onValueChange: (value: number) => void;
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onValueChange, className, ...props }, ref) => {
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
            onValueChange(parseBrazilianCurrency(nextValue));
          }}
          onBlur={() => setDisplayValue(formatCurrencyInput(displayValue))}
          className={className ? `pl-9 ${className}` : 'pl-9'}
          {...props}
        />
      </div>
    );
  },
);

CurrencyInput.displayName = 'CurrencyInput';