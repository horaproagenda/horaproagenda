import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { deleteCashRegisterDefinitively, deleteClientAsset, invalidateAfterPurge, removeStorageFiles, removeDeletedClientFromCache } from '../deletionCleanup';

const mocks = vi.hoisted(() => ({ from: vi.fn(), storage: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: mocks.from,
  storage: { from: () => ({ remove: mocks.storage }) },
} }));

describe('exclusão com respostas verificadas', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.storage.mockResolvedValue({ error: null });
  });

  it('não remove arquivo quando o banco recusa a exclusão', async () => {
    mocks.from.mockReturnValue({ delete: () => ({ eq: () => ({ select: async () => ({ data: null, error: new Error('Negado') }) }) }) });
    await expect(deleteClientAsset('client_documents', 'doc-1')).rejects.toThrow('Negado');
    expect(mocks.storage).not.toHaveBeenCalled();
  });

  it('zero linhas apagadas não conta como sucesso', async () => {
    mocks.from.mockReturnValue({ delete: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }) });
    await expect(deleteClientAsset('client_documents', 'doc-1')).rejects.toThrow();
    expect(mocks.storage).not.toHaveBeenCalled();
  });

  it('remove o caminho retornado pelo banco', async () => {
    mocks.from.mockReturnValue({ delete: () => ({ eq: () => ({ select: async () => ({ data: [{ id: 'doc-1', file_path: 'client-1/document.pdf' }], error: null }) }) }) });
    await deleteClientAsset('client_documents', 'doc-1');
    expect(mocks.storage).toHaveBeenCalledWith(['client-1/document.pdf']);
  });

  it('falha do armazenamento não é sucesso', async () => {
    mocks.from.mockReturnValue({ delete: () => ({ eq: () => ({ select: async () => ({ data: [{ id: 'doc-1', file_path: 'client-1/document.pdf' }], error: null }) }) }) });
    mocks.storage.mockResolvedValue({ error: new Error('Arquivo não apagado') });
    await expect(deleteClientAsset('client_documents', 'doc-1')).rejects.toThrow('Arquivo não apagado');
  });

  it('deduplica e divide os arquivos em lotes sem perder nenhum', async () => {
    const paths = Array.from({ length: 201 }, (_, i) => `client-1/${i}.jpg`);
    await removeStorageFiles('client-photos', [...paths, paths[0], null]);
    expect(mocks.storage).toHaveBeenCalledTimes(3);
    expect(mocks.storage.mock.calls.flatMap(([batch]) => batch)).toEqual(paths);
  });

  it('não aceita caminho vazio ou com subida de pasta', async () => {
    await expect(removeStorageFiles('client-photos', ['../other/client.jpg'])).rejects.toThrow();
    expect(mocks.storage).not.toHaveBeenCalled();
  });

  it('erro na remoção das transações interrompe a exclusão do caixa', async () => {
    mocks.from.mockReturnValue({ delete: () => ({ eq: async () => ({ error: new Error('Negado') }) }) });
    await expect(deleteCashRegisterDefinitively('register-1')).rejects.toThrow('Negado');
    expect(mocks.from.mock.calls).toEqual([['cash_transactions']]);
  });

  it('caixa que não foi apagado retorna erro, mesmo sem erro de conexão', async () => {
    mocks.from.mockReturnValueOnce({ delete: () => ({ eq: async () => ({ error: null }) }) });
    mocks.from.mockReturnValueOnce({ delete: () => ({ eq: () => ({ select: async () => ({ error: null, data: [] }) }) }) });
    await expect(deleteCashRegisterDefinitively('register-1')).rejects.toThrow();
  });

  it('invalida as listas reais de produto, financeiro e arquivos', async () => {
    const client = new QueryClient();
    for (const key of ['product_purchases', 'product_usage_records', 'service_products', 'cash_transactions', 'client-documents']) {
      client.setQueryData([key], ['data']);
    }
    invalidateAfterPurge(client);
    for (const key of ['product_purchases', 'product_usage_records', 'service_products', 'cash_transactions', 'client-documents']) {
      expect(client.getQueryState([key])?.isInvalidated).toBe(true);
    }
    client.clear();
  });

  it('cliente excluído sai imediatamente do cache sem apagar os demais clientes', () => {
    const client = new QueryClient();
    client.setQueryData(['clients'], [{ id: 'deleted' }, { id: 'keep' }]);
    client.setQueryData(['client', 'deleted'], { id: 'deleted' });
    client.setQueryData(['client', 'keep'], { id: 'keep' });
    removeDeletedClientFromCache(client, 'deleted');
    expect(client.getQueryData(['clients'])).toEqual([{ id: 'keep' }]);
    expect(client.getQueryData(['client', 'deleted'])).toBeUndefined();
    expect(client.getQueryData(['client', 'keep'])).toEqual({ id: 'keep' });
    client.clear();
  });
});