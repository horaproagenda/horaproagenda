import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Exclusão definitiva: arquivos apagados do armazenamento junto com o registro.
 * Um erro do Storage é propagado — nunca mostrar "excluído" com arquivo sobrando.
 */
export async function removeStorageFiles(bucket: string, paths: Array<string | null | undefined>) {
  const clean = Array.from(new Set(paths.filter((p): p is string => !!p && !/^https?:/i.test(p))));
  if (clean.length === 0) return;
  for (let i = 0; i < clean.length; i += 100) {
    const { error } = await supabase.storage.from(bucket).remove(clean.slice(i, i + 100));
    if (error) throw error;
  }
}

/** Caminhos de todos os arquivos de um cliente (fotos, documentos e avatar). */
export async function collectClientFilePaths(clientId: string) {
  const [photos, docs, client] = await Promise.all([
    supabase.from('treatment_photos').select('file_path').eq('client_id', clientId),
    supabase.from('client_documents').select('file_path').eq('client_id', clientId),
    supabase.from('clients').select('complementary_info').eq('id', clientId).maybeSingle(),
  ]);
  if (photos.error) throw photos.error;
  if (docs.error) throw docs.error;
  let avatar: string | null = null;
  try {
    const info = client.data?.complementary_info ? JSON.parse(client.data.complementary_info as string) : null;
    avatar = typeof info?.avatar_path === 'string' ? info.avatar_path : null;
  } catch { /* sem avatar */ }
  return {
    photos: [...(photos.data || []).map(r => r.file_path), avatar],
    documents: (docs.data || []).map(r => r.file_path),
  };
}

export async function removeClientFiles(paths: { photos: Array<string | null>; documents: Array<string | null> }) {
  await removeStorageFiles('client-photos', paths.photos);
  await removeStorageFiles('client-documents', paths.documents);
}

/** Todas as listas afetadas por uma exclusão em cascata. */
export const PURGE_QUERY_KEYS = [
  'clients', 'client', 'appointments', 'client-appointments', 'service_packages', 'client_packages',
  'package_appointments', 'client_services', 'single_sales', 'client-sales', 'financial_entries',
  'cash_transactions', 'cash_registers', 'boleto_installments', 'client_credit_transactions',
  'client-photos', 'client-documents', 'client_documents', 'quotes', 'client-quotes', 'reminders',
  'products', 'product_purchases', 'product_usage_records', 'product_daily_consumption',
  'service_products', 'package_template_products', 'application_records',
] as const;

export function invalidateAfterPurge(queryClient: QueryClient, keys: readonly string[] = PURGE_QUERY_KEYS) {
  for (const key of keys) queryClient.invalidateQueries({ queryKey: [key] });
}

/** Caixa: RPC atômica; se ainda não publicada no banco, apaga em etapas checando cada erro. */
export async function deleteCashRegisterDefinitively(registerId: string) {
  const { error } = await (supabase as any).rpc('delete_cash_register_atomic', { _register_id: registerId });
  if (!error) return;
  const missing = error.code === 'PGRST202' || /Could not find the function/i.test(error.message || '');
  if (!missing) throw error;
  const tx = await supabase.from('cash_transactions').delete().eq('cash_register_id', registerId);
  if (tx.error) throw tx.error;
  const reg = await supabase.from('cash_registers').delete().eq('id', registerId).select('id');
  if (reg.error) throw reg.error;
  if (!reg.data || reg.data.length === 0) throw new Error('Caixa não encontrado ou sem permissão para excluir');
}
