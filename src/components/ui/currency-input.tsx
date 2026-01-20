import * as React from "react";
import { cn } from "@/lib/utils";

export interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value: number;
  onChange: (value: number) => void;
  showPrefix?: boolean;
}

/**
 * Formats a number to Brazilian currency format (1.234,56)
 */
export function formatCurrencyBR(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Formats a number to Brazilian currency with R$ prefix
 */
export function formatCurrencyWithPrefix(value: number): string {
  return `R$ ${formatCurrencyBR(value)}`;
}

/**
 * Parses Brazilian currency format to number
 * Handles inputs like: 1.000,00 | 1000,00 | 1000.00 | 1000 | 1.000
 */
export function parseCurrencyBR(value: string): number {
  if (!value || value.trim() === '') return 0;
  
  // Remove R$ prefix and spaces
  let cleaned = value.replace(/R\$\s*/g, '').trim();
  
  // Count occurrences of dots and commas
  const dotCount = (cleaned.match(/\./g) || []).length;
  const commaCount = (cleaned.match(/,/g) || []).length;
  
  // Determine the format:
  // Brazilian format: 1.234,56 (dots as thousands, comma as decimal)
  // US format: 1,234.56 (commas as thousands, dot as decimal)
  
  if (commaCount === 1 && dotCount >= 1) {
    // Format: 1.234,56 (Brazilian)
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (commaCount === 1 && dotCount === 0) {
    // Format: 1234,56 (Brazilian without thousands separator)
    cleaned = cleaned.replace(',', '.');
  } else if (commaCount === 0 && dotCount === 1) {
    // Format: 1234.56 (decimal with dot) or 1.234 (thousands with dot)
    // Check if there are exactly 3 digits after the dot (thousands separator)
    const parts = cleaned.split('.');
    if (parts[1]?.length === 3 && !parts[1].includes(',')) {
      // It's a thousands separator (1.234 = 1234)
      cleaned = cleaned.replace('.', '');
    }
    // Otherwise keep as decimal (1234.56)
  } else if (dotCount > 1) {
    // Multiple dots = thousands separators (1.234.567)
    cleaned = cleaned.replace(/\./g, '');
  }
  
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className, value, onChange, showPrefix = false, ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState(() => 
      value > 0 ? formatCurrencyBR(value) : ''
    );
    const [isFocused, setIsFocused] = React.useState(false);

    // Update display when external value changes (and not focused)
    React.useEffect(() => {
      if (!isFocused) {
        setDisplayValue(value > 0 ? formatCurrencyBR(value) : '');
      }
    }, [value, isFocused]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;
      
      // Allow only numbers, dots, commas
      const sanitized = inputValue.replace(/[^\\d.,]/g, '');
      setDisplayValue(sanitized);
      
      // Parse and emit the numeric value
      const numericValue = parseCurrencyBR(sanitized);
      onChange(numericValue);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      // Select all text for easy editing
      e.target.select();
    };

    const handleBlur = () => {
      setIsFocused(false);
      // Format on blur
      const numericValue = parseCurrencyBR(displayValue);
      setDisplayValue(numericValue > 0 ? formatCurrencyBR(numericValue) : '');
      onChange(numericValue);
    };

    return (
      <div className="relative">
        {showPrefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
            R$
          </span>
        )}
        <input
          type="text"
          inputMode="decimal"
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            showPrefix && "pl-9",
            className
          )}
          ref={ref}
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="0,00"
          {...props}
        />
      </div>
    );
  }
);

CurrencyInput.displayName = "CurrencyInput";

export { CurrencyInput };
