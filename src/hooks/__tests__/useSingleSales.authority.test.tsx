import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { useSingleSales } from '../useSingleSales';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), insert: vi.fn(), update: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({ order: async () => ({ data: [], error: null }) }),
      insert: mocks.insert, update: mocks.update,
    }),
  },
}));
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const sale = {
  client_id: null, service_id: 'service-id', package_id: null,
  item_type: 'service' as const, description: 'Serviço',
  original_amount: 100, discount_amount: 20, final_amount: 80,
  payment_method_id: 'method-id', bank_id: null, sale_date: '2026-10-14',
  notes: null, created_by: null, paid_by: null, paid_at: '2026-10-14T00:00:00Z',
  installments: 1, card_fee_amount: 0,
};

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useSingleSales(), { wrapper });
}

describe('venda avulsa usa somente a operação oficial', () => {
  beforeEach(() => vi.clearAllMocks());

  it('valor final é retornado pelo servidor, sem gravações paralelas', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { id: 'sale-id', final_amount: 80 }, error: null });
    const { result } = setup();
    await act(async () => {
      const saved = await result.current.createSale.mutateAsync(sale);
      expect(saved.saleData).toEqual({ id: 'sale-id', final_amount: 80 });
    });
    expect(mocks.rpc).toHaveBeenCalledWith('create_single_sale_atomic', expect.objectContaining({
      _sale: expect.objectContaining({ original_amount: 100, discount_amount: 20 }),
    }));
    expect(mocks.rpc.mock.calls[0][1]._sale).not.toHaveProperty('final_amount');
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('falha de rede e nova tentativa mantêm a mesma chave, mesmo com outro horário local', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error('Falha de rede') })
      .mockResolvedValueOnce({ data: { id: 'sale-id', final_amount: 80 }, error: null });
    const { result } = setup();
    await act(async () => {
      await expect(result.current.createSale.mutateAsync(sale)).rejects.toThrow('Falha de rede');
    });
    await act(async () => {
      await result.current.createSale.mutateAsync({ ...sale, paid_at: '2026-10-14T00:01:00Z' });
    });
    expect(mocks.rpc.mock.calls[0][1]._request_id).toBe(mocks.rpc.mock.calls[1][1]._request_id);
  });
});