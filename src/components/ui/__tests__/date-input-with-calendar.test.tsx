import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DateInputWithCalendar } from '../date-input-with-calendar';

describe('DateInputWithCalendar', () => {
  it('abre o calendário no mês da data do formulário e em português', () => {
    render(<DateInputWithCalendar value="2026-12-10" onChange={() => {}} />);

    fireEvent.click(screen.getByLabelText('Abrir calendário'));

    expect(screen.getByText(/dezembro 2026/i)).toBeTruthy();
    // dias da semana em português (seg, ter, qua...)
    expect(screen.getAllByText(/^qua$/i).length).toBeGreaterThan(0);
  });

  it('devolve a data selecionada no formato yyyy-MM-dd', () => {
    const onChange = vi.fn();
    render(<DateInputWithCalendar value="2026-12-10" onChange={onChange} />);

    fireEvent.click(screen.getByLabelText('Abrir calendário'));
    fireEvent.click(screen.getByRole('gridcell', { name: '15' }));

    expect(onChange).toHaveBeenCalledWith('2026-12-15');
  });
});
