import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientApplicationsTab } from './ClientApplicationsTab';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), invalidate: vi.fn(), error: vi.fn(), records: [] as unknown[],
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ hasRole: (role: string) => role === 'admin' }) }));
vi.mock('@/hooks/useCurrentProfessional', () => ({ useCurrentProfessional: () => ({ professionalId: null }) }));
vi.mock('@/hooks/useProfessionals', () => ({ useProfessionals: () => ({ professionals: [] }) }));
vi.mock('@/lib/toast', () => ({ toast: { error: mocks.error, success: vi.fn() } }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === 'application_records' ? mocks.records : queryKey[0] === 'application_appts' ? [{ id: 'appt', start_time: 'bad-historical-date' }] : [],
    isLoading: false,
  }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));

function fillProcedure() {
  const field = screen.getByText('Procedimento realizado *').parentElement?.querySelector('input');
  if (!field) throw new Error('Campo do procedimento não encontrado');
  fireEvent.change(field, { target: { value: 'Laser' } });
}

describe('gravação oficial de fichas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.records = [];
    mocks.invalidate.mockResolvedValue(undefined);
    mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null });
  });
  it('abre nova ficha mesmo com data histórica inválida e salva em uma única chamada', async () => {
    render(<ClientApplicationsTab clientId="client" clientName="Teste" />);
    fireEvent.click(screen.getByRole('button', { name: 'Nova ficha' }));
    fillProcedure();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenCalledWith('save_application_record_atomic', expect.objectContaining({
      _id: expect.any(String), _record: expect.objectContaining({ client_id: 'client', procedure_name: 'Laser', appointment_id: null }),
      _items: [], _values: {}, _finalize: false, _expected_updated_at: null,
    }));
    expect(mocks.rpc.mock.calls[0][1]._record.performed_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
  it('preserva o rascunho e a mesma identidade após falha do servidor', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('Falha de teste') });
    render(<ClientApplicationsTab clientId="client" clientName="Teste" />);
    fireEvent.click(screen.getByRole('button', { name: 'Nova ficha' }));
    fillProcedure();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(screen.getByDisplayValue('Laser')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
    expect(mocks.rpc.mock.calls[1][1]._id).toBe(mocks.rpc.mock.calls[0][1]._id);
  });
  it('envia a versão e o agendamento existentes ao continuar uma ficha', async () => {
    mocks.records = [{ id: 'record', updated_at: '2026-10-15T18:00:00Z', appointment_id: 'appt', client_id: 'client',
      professional_id: null, procedure_template_id: null, procedure_name: 'Laser', template_snapshot: { fields: [] },
      status: 'draft', performed_at: '2026-10-15T18:00:00Z', application_items: [], application_field_values: [],
    }];
    render(<ClientApplicationsTab clientId="client" clientName="Teste" />);
    fireEvent.click(screen.getByText('Laser'));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar preenchimento' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ _id: 'record', _expected_updated_at: '2026-10-15T18:00:00Z', _record: { appointment_id: 'appt' } });
  });
});