// Regras únicas de documentos de clientes. ESPELHADO byte a byte em
// supabase/functions/_shared/documentRules.ts (um teste garante a igualdade).

export type ClientDocumentKind = 'anamnese' | 'contract' | 'consent' | 'other';

/** Define o tipo do documento a partir da categoria do modelo e, na falta dela, do título. */
export function inferDocumentType(category: string | null | undefined, title: string | null | undefined): ClientDocumentKind {
  if (category === 'anamnese' || category === 'contract' || category === 'consent') return category;
  const t = (title || '').toLowerCase();
  if (t.includes('anamnese')) return 'anamnese';
  if (t.includes('contrato')) return 'contract';
  if (t.includes('termo') || t.includes('consent')) return 'consent';
  return 'other';
}
