import type { ClientDocument } from '@/types';

const AUTO_FILL_KEYS = new Set([
  'nome', 'nome_cliente', 'cliente',
  'cpf', 'telefone', 'email',
  'nascimento', 'data_nascimento',
  'idade', 'idade_cliente',
  'profissional', 'professional', 'nome_profissional',
  'data', 'date', 'data_atual', 'hora', 'data_extenso',
]);

const hasMeaningfulValue = (value: unknown): boolean => {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.some(hasMeaningfulValue);
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(hasMeaningfulValue);
  }
  return false;
};

/**
 * "Preenchido" só quando houver respostas reais do cliente
 * (perguntas Sim/Não, campos de texto livre, observações ou variáveis customizadas).
 * Documentos apenas salvos com o modelo (só com dados auto-preenchidos) NÃO contam.
 * Documentos enviados como arquivo (upload) também não exibem este status.
 */
export function isDocumentFilled(doc: Pick<ClientDocument, 'file_path' | 'file_url' | 'filled_variables'>): boolean {
  if (doc.file_path || doc.file_url) return false;
  const vars = doc.filled_variables;
  if (!vars || typeof vars !== 'object') return false;

  for (const [key, value] of Object.entries(vars as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();

    if (key === 'yesNoAnswers') {
      const answers = value as Record<string, unknown> | null;
      if (answers && typeof answers === 'object') {
        const hasYesNo = Object.values(answers).some(v => v === 'sim' || v === 'nao');
        if (hasYesNo) return true;
      }
      continue;
    }

    if (AUTO_FILL_KEYS.has(lowerKey)) continue;
    if (hasMeaningfulValue(value)) return true;
  }

  return false;
}

/**
 * "Assinado" exige assinatura registrada (data + identificação de quem assinou).
 */
export function isDocumentSigned(doc: Pick<ClientDocument, 'signed_at' | 'signed_by'>): boolean {
  return !!doc.signed_at && !!doc.signed_by && doc.signed_by.trim().length > 0;
}
