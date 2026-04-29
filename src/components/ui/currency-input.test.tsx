import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { CurrencyInput } from './currency-input';

function CurrencyInputHarness({ onCentsChange }: { onCentsChange: (cents: number) => void }) {
  const [currentValue, setCurrentValue] = useState(0);

  return (
    <CurrencyInput
      aria-label="Valor"
      value={currentValue}
      onValueChange={setCurrentValue}
      onCentsChange={onCentsChange}
    />
  );
}

describe('CurrencyInput', () => {
  it('formata a digitação incremental em BRL e emite centavos corretamente', () => {
    const onCentsChange = vi.fn();
    render(<CurrencyInputHarness onCentsChange={onCentsChange} />);

    const input = screen.getByLabelText('Valor') as HTMLInputElement;

    fireEvent.focus(input);

    fireEvent.change(input, { target: { value: '1' } });
    expect(input.value).toBe('1');
    expect(onCentsChange).toHaveBeenLastCalledWith(100);

    fireEvent.change(input, { target: { value: '10' } });
    expect(input.value).toBe('10');
    expect(onCentsChange).toHaveBeenLastCalledWith(1000);

    fireEvent.change(input, { target: { value: '100' } });
    expect(input.value).toBe('100');
    expect(onCentsChange).toHaveBeenLastCalledWith(10000);

    fireEvent.change(input, { target: { value: '1000' } });
    expect(input.value).toBe('1.000');
    expect(onCentsChange).toHaveBeenLastCalledWith(100000);

    fireEvent.change(input, { target: { value: '1234,56' } });
    expect(input.value).toBe('1.234,56');
    expect(onCentsChange).toHaveBeenLastCalledWith(123456);

    fireEvent.blur(input);
    expect(input.value).toBe('1.234,56');
  });
});