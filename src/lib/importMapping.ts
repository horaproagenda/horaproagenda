/**
 * Helpers puros para mapeamento de colunas das telas de importação.
 *
 * Mantidos isolados do React para permitir testes determinísticos e garantir
 * que cada coluna do CSV/Excel chegue ao destino correto, sem ambiguidade.
 */

export type ImportType = 'services' | 'clients' | 'package_templates' | 'appointments';

export interface ColumnSpec {
  /** Nome canônico interno. */
  key: string;
  /** Lista de aliases (já normalizados em lowercase, sem acento). */
  aliases: string[];
  required?: boolean;
  label: string;
}

const COLUMN_SPECS: Record<ImportType, ColumnSpec[]> = {
  services: [
    { key: 'name', label: 'Nome', required: true, aliases: ['nome', 'name', 'servico', 'service'] },
    { key: 'category', label: 'Categoria', aliases: ['categoria', 'category'] },
    { key: 'price', label: 'Preço', aliases: ['preco', 'price', 'valor'] },
    { key: 'duration', label: 'Duração', aliases: ['duracao', 'duration', 'tempo'] },
    { key: 'description', label: 'Descrição', aliases: ['descricao', 'description', 'desc'] },
    { key: 'return_days', label: 'Retorno', aliases: ['retorno', 'return_days', 'return'] },
  ],
  clients: [
    { key: 'name', label: 'Nome', required: true, aliases: ['nome', 'name', 'cliente'] },
    { key: 'phone', label: 'Telefone', required: true, aliases: ['telefone', 'phone', 'celular', 'fone', 'whatsapp'] },
    { key: 'email', label: 'Email', aliases: ['email', 'e-mail', 'mail'] },
    { key: 'cpf', label: 'CPF', aliases: ['cpf', 'documento'] },
    { key: 'birthdate', label: 'Nascimento', aliases: ['nascimento', 'birthdate', 'data_nascimento', 'aniversario'] },
    { key: 'notes', label: 'Observações', aliases: ['observacoes', 'observacao', 'obs', 'notes', 'observ'] },
    { key: 'referral_source', label: 'Indicação', aliases: ['indicacao', 'referral', 'origem', 'referral_source'] },
  ],
  package_templates: [
    { key: 'name', label: 'Nome', required: true, aliases: ['nome', 'name', 'pacote'] },
    { key: 'total_sessions', label: 'Sessões', aliases: ['sessoes', 'total_sessions', 'sessions', 'qtde', 'quantidade'] },
    { key: 'price', label: 'Preço', aliases: ['preco', 'price', 'valor'] },
    { key: 'duration', label: 'Duração', aliases: ['duracao', 'duration', 'tempo'] },
    { key: 'interval_days', label: 'Intervalo', aliases: ['intervalo', 'interval_days', 'intervalo_dias', 'interval'] },
    { key: 'description', label: 'Descrição', aliases: ['descricao', 'description', 'desc'] },
  ],
  appointments: [
    { key: 'date', label: 'Data', required: true, aliases: ['data', 'date', 'dia'] },
    { key: 'startTime', label: 'Horário Início', required: true, aliases: ['inicio', 'horario', 'hora', 'start'] },
    { key: 'endTime', label: 'Horário Fim', aliases: ['fim', 'termino', 'end'] },
    { key: 'clientName', label: 'Cliente', required: true, aliases: ['cliente', 'nome', 'client'] },
    { key: 'clientPhone', label: 'Telefone', aliases: ['telefone', 'celular', 'fone', 'phone'] },
    { key: 'serviceName', label: 'Serviço', aliases: ['servico', 'service'] },
    { key: 'professionalName', label: 'Profissional', aliases: ['profissional', 'professional', 'colaborador'] },
    { key: 'roomName', label: 'Sala', aliases: ['sala', 'room'] },
    { key: 'notes', label: 'Observações', aliases: ['observ', 'nota', 'obs', 'notes'] },
  ],
};

/** Normaliza um header removendo acentos, espaços extras e baixando case. */
export function normalizeHeader(value: string): string {
  return (value ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export interface MappingResult {
  /** Mapa key canônica -> índice da coluna no CSV (ou -1 quando ausente). */
  indices: Record<string, number>;
  /** Colunas obrigatórias que faltaram. */
  missingRequired: string[];
  /** Headers do arquivo que não bateram com nenhum alias conhecido. */
  unknownHeaders: string[];
}

/**
 * Resolve os índices das colunas para um tipo de importação a partir do
 * cabeçalho do arquivo. Não lança — retorna o resultado com `missingRequired`
 * preenchido para que a UI mostre erros claros.
 */
export function mapHeaders(type: ImportType, rawHeaders: string[]): MappingResult {
  const specs = COLUMN_SPECS[type];
  const normalized = rawHeaders.map(normalizeHeader);

  const indices: Record<string, number> = {};
  const matchedIdx = new Set<number>();

  for (const spec of specs) {
    let idx = -1;

    // 1) match exato com qualquer alias
    idx = normalized.findIndex((h, i) => !matchedIdx.has(i) && spec.aliases.includes(h));

    // 2) match "contém" como fallback (apenas se aliases >= 3 chars)
    if (idx === -1) {
      idx = normalized.findIndex(
        (h, i) =>
          !matchedIdx.has(i) &&
          spec.aliases.some((a) => a.length >= 3 && (h.includes(a) || a.includes(h)) && h.length > 0),
      );
    }

    indices[spec.key] = idx;
    if (idx >= 0) matchedIdx.add(idx);
  }

  const missingRequired = specs
    .filter((s) => s.required && indices[s.key] < 0)
    .map((s) => s.label);

  const unknownHeaders = normalized
    .map((h, i) => ({ h, i }))
    .filter(({ i, h }) => !matchedIdx.has(i) && h.length > 0)
    .map(({ h }) => h);

  return { indices, missingRequired, unknownHeaders };
}

/** Recupera o spec de colunas (útil para gerar UI de modelo). */
export function getColumnSpecs(type: ImportType): ColumnSpec[] {
  return COLUMN_SPECS[type];
}
