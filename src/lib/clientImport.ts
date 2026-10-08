import { supabase } from '@/integrations/supabase/client';
import {
  validateClientInput,
  normalizeClientInput,
  duplicateClientMessage,
  type ClientInput,
  type NormalizedClient,
} from '@/lib/clientRules';

export type ImportRow = ClientInput & { is_active?: boolean };

/**
 * Pure step: applies the shared client rules to a batch, removing rows that are
 * invalid or duplicated (inside the file or against already-registered keys).
 */
export function filterImportBatch(
  rows: ImportRow[],
  existing: { phones: Set<string>; cpfs: Set<string> },
): { clientsToInsert: (NormalizedClient & { is_active: boolean })[]; skipped: string[] } {
  const phones = new Set(existing.phones);
  const cpfs = new Set(existing.cpfs);
  const clientsToInsert: (NormalizedClient & { is_active: boolean })[] = [];
  const skipped: string[] = [];
  for (const r of rows) {
    const label = (r.name || '').trim() || 'Sem nome';
    const errs = validateClientInput(r);
    if (errs.length) {
      skipped.push(`${label}: ${errs[0].message}`);
      continue;
    }
    const row = normalizeClientInput(r);
    if (phones.has(row.phone)) {
      skipped.push(`${label}: ${duplicateClientMessage('phone')}`);
      continue;
    }
    if (row.cpf && cpfs.has(row.cpf)) {
      skipped.push(`${label}: ${duplicateClientMessage('cpf')}`);
      continue;
    }
    phones.add(row.phone);
    if (row.cpf) cpfs.add(row.cpf);
    clientsToInsert.push({ ...row, is_active: r.is_active ?? true });
  }
  return { clientsToInsert, skipped };
}

/** Loads the account's existing phones/CPFs (RLS keeps it per account) and filters the batch. */
export async function prepareClientsForImport(rows: ImportRow[]) {
  const phonesIn = Array.from(new Set(rows.map((r) => (r.phone || '').replace(/\D/g, '')).filter(Boolean)));
  const cpfsIn = Array.from(new Set(rows.map((r) => (r.cpf || '').replace(/\D/g, '')).filter(Boolean)));
  const phones = new Set<string>();
  const cpfs = new Set<string>();
  for (let i = 0; i < phonesIn.length; i += 200) {
    const { data } = await supabase.from('clients').select('phone').in('phone', phonesIn.slice(i, i + 200));
    (data || []).forEach((d: any) => d.phone && phones.add(d.phone));
  }
  for (let i = 0; i < cpfsIn.length; i += 200) {
    const { data } = await supabase.from('clients').select('cpf').in('cpf', cpfsIn.slice(i, i + 200));
    (data || []).forEach((d: any) => d.cpf && cpfs.add(d.cpf));
  }
  return filterImportBatch(rows, { phones, cpfs });
}
