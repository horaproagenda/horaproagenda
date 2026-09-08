import * as React from 'react';
import { Input } from '@/components/ui/input';

interface NumberInputProps extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> {
  /** Valor numérico atual (null/undefined = campo vazio). */
  value: number | null | undefined;
  /** Chamado com o número digitado ou null quando o campo está vazio. */
  onValueChange: (value: number | null) => void;
  /** Valor usado quando o campo é deixado vazio e o formulário exige um número. */
  emptyValue?: number | null;
}

/**
 * Campo numérico que permite apagar o valor pré-preenchido e ficar realmente vazio
 * (sem o "0" teimoso), mantendo o que o usuário digita enquanto edita.
 */
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ value, onValueChange, emptyValue = null, min, max, onBlur, ...props }, ref) => {
    const [draft, setDraft] = React.useState<string>(value == null ? '' : String(value));
    const [isEditing, setIsEditing] = React.useState(false);

    React.useEffect(() => {
      if (isEditing) return;
      setDraft(value == null ? '' : String(value));
    }, [isEditing, value]);

    const clamp = (n: number) => {
      let out = n;
      if (typeof min === 'number' && out < min) out = min;
      if (typeof max === 'number' && out > max) out = max;
      return out;
    };

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft}
        onFocus={(e) => {
          setIsEditing(true);
          props.onFocus?.(e);
        }}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d]/g, '');
          setDraft(raw);
          if (raw === '') {
            onValueChange(null);
            return;
          }
          onValueChange(Number(raw));
        }}
        onBlur={(e) => {
          setIsEditing(false);
          if (draft === '') {
            onValueChange(emptyValue);
            setDraft(emptyValue == null ? '' : String(emptyValue));
          } else {
            const next = clamp(Number(draft));
            onValueChange(next);
            setDraft(String(next));
          }
          onBlur?.(e);
        }}
        {...props}
      />
    );
  },
);

NumberInput.displayName = 'NumberInput';
