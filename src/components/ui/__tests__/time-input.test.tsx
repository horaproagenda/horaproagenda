import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { TimeInput } from '../time-input';

// Regressão: digitar a hora e depois os minutos não pode apagar a hora.
describe('TimeInput', () => {
  it('não avisa o formulário nem apaga a digitação com horário incompleto', () => {
    const onChange = vi.fn();
    const { getByLabelText, rerender } = render(
      <label>
        Início
        <TimeInput aria-label="Início" value="19:00" onChange={onChange} />
      </label>,
    );
    const input = getByLabelText('Início') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();

    // O formulário continua com o valor anterior e não sobrescreve o campo.
    rerender(
      <label>
        Início
        <TimeInput aria-label="Início" value="19:00" onChange={onChange} />
      </label>,
    );
    expect(input.value).toBe('');

    fireEvent.change(input, { target: { value: '19:30' } });
    expect(onChange).toHaveBeenLastCalledWith('19:30');
  });

  it('restaura o último horário válido quando o campo sai incompleto', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <label>
        Início
        <TimeInput aria-label="Início" value="08:00" onChange={onChange} />
      </label>,
    );
    const input = getByLabelText('Início') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('');
  });
});
