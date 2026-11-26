import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Exclusão definitiva: arquivos apagados do armazenamento junto com o registro.
 * Um erro do Storage é propagado — nunca mostrar "excluído" com arquivo sobrando.
 */
export async function removeStorageFiles(bucket: string, paths: Array<string | null | undefined>) {
  const clean = Array.from(new Set(paths.filter((p): p is string => !!p)));
  if (clean.some(path => /^https?:/i.test(path) || path.split('/').some(part => !part || part === '.' || part === '..'))) {
    throw new Error('Não foi possível identificar o arquivo para exclusão');
  }
  if (clean.length === 0) return;
  for (let i = 0; i < clean.length; i += 100) {
    const { error } = await supabase.storage.from(bucket).remove(clean.slice(i, i + 100));
    if (error) throw error;
  }
}

/** Usa o caminho devolvido pelo DELETE autorizado, não o caminho enviado pelo botão. */
export async function deleteClientAsset(table: 'treatment_photos' | 'client_documents', id: string) {
  const { data, error } = await supabase.from(table).delete().eq('id', id).select('id, file_path');
  if (error) throw error;
  const deleted = data?.[0];
  if (!deleted) throw new Error('Registro não encontrado ou sem permissão para excluir');
  if (deleted.file_path) {
    await removeStorageFiles(table === 'treatment_photos' ? 'client-photos' : 'client-documents', [deleted.file_path]);
  }
}

/** Todas as listas afetadas por uma exclusão em cascata. */
export const PURGE_QUERY_KEYS = [
  'clients', 'client', 'appointments', 'client-appointments', 'service_packages', 'client_packages',
  'package_appointments', 'client_services', 'single_sales', 'client-sales', 'financial_entries',
  'cash_transactions', 'cash_registers', 'boleto_installments', 'client_credit_transactions',
  'client_credits', 'client_packages_with_counts', 'package_details',
  'client-photos', 'client-documents', 'client_documents', 'quotes', 'client-quotes', 'reminders',
  'products', 'product_purchases', 'product_usage_records', 'product_daily_consumption',
  'service_products', 'package_template_products', 'application_records',
] as const;

export function invalidateAfterPurge(queryClient: QueryClient, keys: readonly string[] = PURGE_QUERY_KEYS) {
  for (const key of keys) queryClient.invalidateQueries({ queryKey: [key] });
}

/** Retira imediatamente só o cadastro confirmado como apagado, sem zerar as demais listas. */
export function removeDeletedClientFromCache(queryClient: QueryClient, clientId: string) {
  queryClient.setQueryData<Array<{ id: string }>>(['clients'], clients => clients?.filter(client => client.id !== clientId));
  queryClient.removeQueries({ queryKey: ['client', clientId], exact: true });
  invalidateAfterPurge(queryClient);
}

/** Checa cada resposta do caminho legado; não substitui uma transação no banco. */
export async function deleteCashRegisterDefinitively(registerId: string) {
  const tx = await supabase.from('cash_transactions').delete().eq('cash_register_id', registerId);
  if (tx.error) throw tx.error;
  const reg = await supabase.from('cash_registers').delete().eq('id', registerId).select('id');
  if (reg.error) throw reg.error;
  if (!reg.data || reg.data.length === 0) throw new Error('Caixa não encontrado ou sem permissão para excluir');
}
