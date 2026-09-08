import * as React from 'react';
import { Input } from '@/components/ui/input';

interface TimeInputProps extends Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type' | 'ref'> {
  value?: string;
  onChange: (value: string) => void;
}

/**
 * Campo de horário que não apaga o que já foi digitado.
 *
 * O campo nativo de hora envia um valor vazio enquanto o horário está
 * incompleto (ex.: "19:--"). Se esse vazio voltar para o campo, a hora
 * digitada desaparece. Aqui o campo mantém o que a pessoa digitou e só
 * avisa o formulário quando o horário está completo.
 */
export const TimeInput = React.forwardRef<HTMLInputElement, TimeInputProps>(
  ({ value = '', onChange, onFocus, onBlur, ...rest }, forwardedRef) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null);
    const isFocused = React.useRef(false);

    const setRefs = (node: HTMLInputElement | null) => {
      innerRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
    };

    // Só sincroniza o campo com o valor do formulário quando ele não está
    // sendo editado — assim a digitação nunca é interrompida.
    React.useEffect(() => {
      const el = innerRef.current;
      if (!el || isFocused.current) return;
      const next = value || '';
      if (el.value !== next) el.value = next;
    }, [value]);

    return (
      <Input
        {...rest}
        ref={setRefs}
        type="time"
        defaultValue={value || ''}
        onFocus={(event) => {
          isFocused.current = true;
          onFocus?.(event);
        }}
        onBlur={(event) => {
          isFocused.current = false;
          const current = event.target.value;
          if (/^\d{2}:\d{2}/.test(current)) {
            const normalized = current.slice(0, 5);
            if (normalized !== (value || '')) onChange(normalized);
          } else if (current === '') {
            if (value) onChange('');
          } else {
            event.target.value = value || '';
          }
          onBlur?.(event);
        }}
        onChange={(event) => {
          const current = event.target.value;
          if (/^\d{2}:\d{2}/.test(current)) onChange(current.slice(0, 5));
        }}
      />
    );
  },
);

TimeInput.displayName = 'TimeInput';
