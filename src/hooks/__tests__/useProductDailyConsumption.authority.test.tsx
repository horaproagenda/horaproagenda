import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { useProductDailyConsumption } from '../useProductDailyConsumption';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), insert: vi.fn(), remove: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: mocks.rpc, removeChannel: vi.fn(),
  channel: () => { const ch = { on: () => ch, subscribe: () => ch }; return ch; },
  from: () => ({ select: () => ({ is: () => ({ order: async () => ({ data: [], error: null }) }) }), insert: mocks.insert, delete: mocks.remove }),
} }));
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const input = { product_id: 'p', quantity_used: 20, unit: 'ml', consumption_date: '2026-10-14' };
function setup() {
 const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
 const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
 return renderHook(() => useProductDailyConsumption(), { wrapper });
}
describe('consumo e estoque na operação oficial', () => {
 beforeEach(() => vi.clearAllMocks());
 it('20 de consumo são enviados juntos sem gravação direta', async () => {
  mocks.rpc.mockResolvedValue({ data: { id: 'c', quantity_used: 20, stock_quantity: 20 }, error: null });
  const { result } = setup();
  await act(async () => { await result.current.createConsumption.mutateAsync(input); });
  expect(mocks.rpc).toHaveBeenCalledWith('record_manual_product_consumption', expect.objectContaining({ _input: input }));
  expect(mocks.insert).not.toHaveBeenCalled();
 });
 it('cancelamento exige motivo e não apaga o histórico', async () => {
  mocks.rpc.mockResolvedValue({ data: { id: 'c', cancelled_at: '2026-10-14' }, error: null });
  const { result } = setup();
  await act(async () => { await result.current.deleteConsumption.mutateAsync({ id: 'c', reason: 'Registro duplicado' }); });
  expect(mocks.rpc).toHaveBeenCalledWith('cancel_manual_product_consumption', { _id: 'c', _reason: 'Registro duplicado' });
  expect(mocks.remove).not.toHaveBeenCalled();
 });
 it('falha seguida de tentativa mantém identificação única', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error('Falha') }).mockResolvedValueOnce({ data: { id: 'c' }, error: null });
  const { result } = setup();
  await act(async () => { await expect(result.current.createConsumption.mutateAsync(input)).rejects.toThrow(); });
  await act(async () => { await result.current.createConsumption.mutateAsync(input); });
  expect(mocks.rpc.mock.calls[0][1]._request_id).toBe(mocks.rpc.mock.calls[1][1]._request_id);
 });
});