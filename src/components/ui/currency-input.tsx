import * as React from 'react';
import { Input } from '@/components/ui/input';
import { formatCurrencyInput, normalizeBrazilianCurrency, parseBrazilianCurrencyToCents } from '@/lib/utils';

interface CurrencyInputProps extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'onBlur'> {
  value: number | string | null | undefined;
  onValueChange: (value: number) => void;
  onCentsChange?: (cents: number) => void;
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onValueChange, onCentsChange, className, onFocus, ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState(formatCurrencyInput(value));
    const [isEditing, setIsEditing] = React.useState(false);

    React.useEffect(() => {
      if (isEditing) return;
      setDisplayValue(formatCurrencyInput(value));
    }, [isEditing, value]);

    const formatTypingValue = (nextValue: string) => {
      const sanitized = nextValue.replace(/[^\d,]/g, '');
      const [rawInteger = '', rawDecimal] = sanitized.split(',', 2);
      const integerDigits = rawInteger.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
      const formattedInteger = integerDigits ? Number(integerDigits).toLocaleString('pt-BR') : '';

      if (sanitized.includes(',')) {
        return `${formattedInteger || '0'},${(rawDecimal || '').replace(/\D/g, '').slice(0, 2)}`;
      }

      return formattedInteger;
    };

    return (
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
        <Input
          ref={ref}
          inputMode="decimal"
          value={displayValue}
          onChange={(event) => {
            const nextValue = formatTypingValue(event.target.value);
            setDisplayValue(nextValue);
            const cents = parseBrazilianCurrencyToCents(nextValue);
            onCentsChange?.(cents);
            onValueChange(cents / 100);
          }}
          onFocus={(event) => {
            setIsEditing(true);
            const input = event.currentTarget;
            if (normalizeBrazilianCurrency(value) === 0) {
              setDisplayValue('');
              window.requestAnimationFrame(() => input.setSelectionRange?.(0, 0));
            }
            onFocus?.(event);
          }}
          onBlur={() => {
            const normalizedValue = normalizeBrazilianCurrency(displayValue);
            onValueChange(normalizedValue);
            onCentsChange?.(Math.round(normalizedValue * 100));
            setDisplayValue(formatCurrencyInput(normalizedValue));
            setIsEditing(false);
          }}
          className={className ? `pl-9 ${className}` : 'pl-9'}
          {...props}
        />
      </div>
    );
  },
);

CurrencyInput.displayName = 'CurrencyInput';