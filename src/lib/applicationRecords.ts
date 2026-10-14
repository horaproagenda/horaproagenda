export type TemplateFieldType = 'text' | 'textarea' | 'number' | 'select' | 'boolean' | 'date';
export interface TemplateField { id: string; label: string; type: TemplateFieldType; options?: string[]; required?: boolean }

export interface ApplicationItemDraft {
  product_id: string | null;
  product_name_snapshot: string;
  manufacturer_snapshot: string;
  lot_number: string;
  expiration_date: string;
  region: string;
  side: string;
  quantity: string;
  unit: string;
  technique: string;
  dilution: string;
  instrument: string;
  notes: string;
}

export const SIDE_OPTIONS = ['Direito', 'Esquerdo', 'Bilateral', 'Central', 'Não se aplica'];
export const UNIT_OPTIONS = ['ml', 'U', 'mg', 'unidades', 'seringas', 'frascos', 'sessões'];

/** Campos fixos de avaliação/orientação — guardados por identificador, nunca por posição. */
export const BASE_FIELDS: TemplateField[] = [
  { id: 'aval_queixa', label: 'Queixa principal', type: 'textarea' },
  { id: 'aval_objetivo', label: 'Objetivo do cliente', type: 'textarea' },
  { id: 'aval_area', label: 'Área avaliada', type: 'text' },
  { id: 'aval_condicoes', label: 'Condições observadas', type: 'textarea' },
  { id: 'aval_historico', label: 'Histórico relevante', type: 'textarea' },
  { id: 'aval_alergias', label: 'Alergias informadas', type: 'text' },
  { id: 'aval_medicamentos', label: 'Medicamentos em uso', type: 'text' },
  { id: 'aval_proc_anteriores', label: 'Procedimentos anteriores', type: 'textarea' },
  { id: 'aval_obs', label: 'Observações clínicas', type: 'textarea' },
];
export const GUIDANCE_FIELDS: TemplateField[] = [
  { id: 'orientacoes', label: 'Orientações fornecidas', type: 'textarea' },
  { id: 'intercorrencias', label: 'Intercorrências', type: 'textarea' },
  { id: 'conduta', label: 'Conduta', type: 'textarea' },
];

export const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho', in_progress: 'Em atendimento', awaiting_signature: 'Aguardando assinatura',
  completed: 'Finalizada', cancelled: 'Cancelada', amended: 'Retificada',
};

export const emptyItem = (): ApplicationItemDraft => ({
  product_id: null, product_name_snapshot: '', manufacturer_snapshot: '', lot_number: '', expiration_date: '',
  region: '', side: '', quantity: '', unit: 'ml', technique: '', dilution: '', instrument: '', notes: '',
});

export interface CompletionInput {
  professional_id: string | null;
  procedure_name: string;
  performed_at: string;
  items: ApplicationItemDraft[];
  templateFields: TemplateField[];
  values: Record<string, string>;
}

/** Mesmas regras que o servidor aplica ao finalizar. */
export function validateCompletion(i: CompletionInput): string[] {
  const missing: string[] = [];
  if (!i.professional_id) missing.push('Profissional');
  if (!i.performed_at) missing.push('Data');
  if (!i.procedure_name.trim()) missing.push('Procedimento');
  if (i.items.length === 0) missing.push('Ao menos um item aplicado');
  i.items.forEach((it, idx) => {
    const n = idx + 1;
    if (!it.product_name_snapshot.trim()) missing.push(`Item ${n}: produto`);
    if (!it.region.trim()) missing.push(`Item ${n}: região`);
    const q = Number(String(it.quantity).replace(',', '.'));
    if (!it.quantity || !Number.isFinite(q) || q <= 0) missing.push(`Item ${n}: quantidade válida`);
    if (!it.unit.trim()) missing.push(`Item ${n}: unidade`);
  });
  i.templateFields.forEach((f) => {
    if (f.required && !(i.values[f.id] ?? '').trim()) missing.push(f.label);
  });
  return missing;
}

/** Ficha anterior como referência: copia só o permitido; produto, lote, validade e quantidade exigem nova confirmação. */
export function buildReferenceItems(prev: Partial<ApplicationItemDraft>[]): ApplicationItemDraft[] {
  return prev.map((p) => ({
    ...emptyItem(),
    region: p.region ?? '',
    side: p.side ?? '',
    technique: p.technique ?? '',
    unit: p.unit ?? 'ml',
    notes: p.notes ? `Anterior: ${p.notes}` : '',
  }));
}

/** Campos que podem ser copiados como referência (avaliação atual e intercorrências são refeitas). */
export const REFERENCE_COPY_FIELD_PREFIXES = ['aval_obs', 'aval_historico'];

export function parseQuantity(q: string): number | null {
  const n = Number(String(q).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}
