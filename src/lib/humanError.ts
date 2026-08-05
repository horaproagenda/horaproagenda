/**
 * Tradutor universal de erros -> explicação em português claro.
 *
 * Objetivo: nenhuma notificação do aplicativo deve exibir código de erro,
 * número de status, nome de constraint ou jargão técnico. Toda mensagem
 * mostrada ao usuário passa por `humanizeError` (aplicado globalmente no
 * wrapper de toasts em `src/lib/toast.ts`).
 */

export interface HumanErrorInput {
  message?: string;
  code?: string | number;
  details?: string;
  hint?: string;
  status?: number;
  statusCode?: number;
  error?: unknown;
  error_description?: string;
  [key: string]: unknown;
}

/** Nome amigável para constraints/tabelas conhecidas. */
const ENTITY_LABELS: Array<[RegExp, string]> = [
  [/clients?/i, 'cliente'],
  [/professionals?/i, 'profissional'],
  [/services?/i, 'serviço'],
  [/package/i, 'pacote'],
  [/product/i, 'produto'],
  [/suppliers?/i, 'fornecedor'],
  [/financial_categor/i, 'categoria financeira'],
  [/financial_entr/i, 'lançamento financeiro'],
  [/payment_method/i, 'forma de pagamento'],
  [/appointment/i, 'agendamento'],
  [/rooms?/i, 'sala'],
  [/equipment/i, 'equipamento'],
  [/bank/i, 'banco'],
  [/user_roles?/i, 'permissão de usuário'],
  [/document/i, 'documento'],
  [/reminder/i, 'lembrete'],
  [/whatsapp/i, 'WhatsApp'],
];

function entityFromText(text: string): string | null {
  for (const [pattern, label] of ENTITY_LABELS) {
    if (pattern.test(text)) return label;
  }
  return null;
}

/** Remove ruído técnico de uma mensagem que já é legível. */
function stripTechnicalNoise(message: string): string {
  return message
    // "PGRST116: ...", "23505: ...", "Error 500: ..."
    .replace(/^\s*(erro|error)?\s*[:\-]?\s*(pgrst\d+|[0-9A-Z]{5}|\d{3})\s*[:\-]\s*/i, '')
    .replace(/\bcódigo\s+(de\s+)?erro[^.,;]*/gi, '')
    .replace(/\((sql)?state[^)]*\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const CODE_MESSAGES: Record<string, string> = {
  // PostgreSQL
  '23505': 'Já existe um registro cadastrado com essas informações. Verifique os dados e use um valor diferente.',
  '23503': 'Este registro está vinculado a outras informações do sistema. Remova ou altere os vínculos antes de continuar.',
  '23502': 'Um campo obrigatório ficou em branco. Preencha todos os campos obrigatórios e salve novamente.',
  '23514': 'Algum dado informado não é aceito neste campo. Revise os valores preenchidos.',
  '22P02': 'Um dos campos foi preenchido em formato inválido (por exemplo, data, hora ou valor). Revise o preenchimento.',
  '22003': 'O valor informado é maior do que o permitido para este campo.',
  '22001': 'O texto informado é maior do que o espaço permitido. Escreva de forma mais curta.',
  '40001': 'Outra pessoa alterou este registro ao mesmo tempo. Tente salvar novamente.',
  '40P01': 'Duas operações tentaram alterar os mesmos dados ao mesmo tempo. Tente novamente em instantes.',
  '42501': 'Você não tem permissão para realizar esta ação. Fale com o administrador da conta.',
  '42P01': 'Esta funcionalidade está indisponível no momento. Tente novamente mais tarde.',
  '57014': 'A operação demorou demais e foi interrompida. Tente novamente com um período menor de dados.',
  P0001: '', // erro lançado por regra do sistema: usar a própria mensagem
  // PostgREST
  PGRST116: 'Não encontramos esse registro. Ele pode ter sido excluído ou alterado por outro usuário.',
  PGRST301: 'Sua sessão expirou. Entre novamente para continuar.',
  PGRST204: 'Não foi possível salvar: um dos campos enviados não existe mais no cadastro. Atualize a página e tente de novo.',
  // Supabase Auth
  invalid_credentials: 'E-mail ou senha incorretos. Confira os dados e tente novamente.',
  invalid_grant: 'E-mail ou senha incorretos. Confira os dados e tente novamente.',
  email_not_confirmed: 'Confirme seu e-mail para acessar o aplicativo. Enviamos um link de confirmação para sua caixa de entrada.',
  user_already_exists: 'Este e-mail já está cadastrado. Faça login ou recupere sua senha.',
  email_exists: 'Este e-mail já está cadastrado. Faça login ou recupere sua senha.',
  email_already_registered: 'Este e-mail já está cadastrado. Faça login ou recupere sua senha.',
  weak_password: 'A senha é muito fraca. Use no mínimo 8 caracteres, com letras e números.',
  over_email_send_rate_limit: 'Muitos e-mails enviados em pouco tempo. Aguarde alguns minutos e tente novamente.',
  over_request_rate_limit: 'Muitas tentativas em pouco tempo. Aguarde um instante antes de tentar de novo.',
  session_not_found: 'Sua sessão expirou. Entre novamente para continuar.',
  // Rede / infra
  '401': 'Sua sessão expirou ou você não está autenticado. Entre novamente para continuar.',
  '403': 'Você não tem permissão para realizar esta ação. Fale com o administrador da conta.',
  '404': 'Não encontramos a informação solicitada. Ela pode ter sido excluída.',
  '409': 'Este registro foi alterado por outra pessoa ao mesmo tempo. Atualize a página e tente novamente.',
  '413': 'O arquivo enviado é grande demais. Envie um arquivo menor.',
  '422': 'Alguns dados enviados não estão no formato esperado. Revise o formulário.',
  '429': 'Muitas tentativas em pouco tempo. Aguarde um instante antes de tentar de novo.',
  '500': 'Ocorreu uma falha ao processar sua solicitação no servidor. Tente novamente em instantes.',
  '502': 'O serviço está temporariamente indisponível. Tente novamente em instantes.',
  '503': 'O serviço está temporariamente indisponível. Tente novamente em instantes.',
  '504': 'O servidor demorou para responder. Verifique sua conexão e tente novamente.',
};

/** Padrões reconhecidos dentro de mensagens técnicas em inglês/SQL. */
const PATTERN_MESSAGES: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [
    /duplicate key value violates unique constraint "?([\w.]+)"?/i,
    (m) => {
      const entity = entityFromText(m[1]);
      const isName = /name|nome/i.test(m[1]);
      const isEmail = /email/i.test(m[1]);
      const isDoc = /cpf|cnpj|document/i.test(m[1]);
      const campo = isEmail ? 'e-mail' : isDoc ? 'CPF/CNPJ' : isName ? 'nome' : 'dados';
      return entity
        ? `Já existe um ${entity} cadastrado com esse ${campo}. Use um valor diferente ou edite o registro existente.`
        : `Já existe um registro cadastrado com esse ${campo}. Use um valor diferente.`;
    },
  ],
  [
    /violates foreign key constraint "?([\w.]+)"?/i,
    (m) => {
      const entity = entityFromText(m[1]);
      return entity
        ? `Este registro está vinculado a um ${entity} do sistema. Ajuste ou remova o vínculo antes de continuar.`
        : 'Este registro está vinculado a outras informações do sistema. Ajuste os vínculos antes de continuar.';
    },
  ],
  [
    /null value in column "?(\w+)"?/i,
    (m) => `O campo "${friendlyField(m[1])}" é obrigatório e não foi preenchido. Complete o cadastro e salve novamente.`,
  ],
  [
    /violates check constraint "?([\w.]+)"?/i,
    () => 'Algum dado informado não é permitido por uma regra do sistema. Revise os valores preenchidos.',
  ],
  [
    /violates row-level security|new row violates row-level|permission denied for (table|relation|column)/i,
    () => 'Você não tem permissão para acessar ou alterar estas informações. Fale com o administrador da conta.',
  ],
  [
    /edge function returned a non-2xx status code|functionshttperror/i,
    () => 'Não foi possível concluir a operação no servidor. Tente novamente em instantes; se persistir, fale com o suporte.',
  ],
  [
    /failed to (fetch|send a request)|network(error| request failed)|err_internet_disconnected|load failed/i,
    () => 'Sem conexão com a internet ou o servidor não respondeu. Verifique sua conexão e tente novamente.',
  ],
  [
    /aborterror|signal is aborted|timeout|timed out/i,
    () => 'A operação demorou mais do que o esperado e foi interrompida. Tente novamente.',
  ],
  [
    /jwt (expired|is expired)|invalid (jwt|token)|refresh token not found/i,
    () => 'Sua sessão expirou. Entre novamente para continuar usando o aplicativo.',
  ],
  [
    /failed to (fetch dynamically imported module|load module script)|chunkloaderror|importing a module script failed/i,
    () => 'Uma nova versão do aplicativo foi publicada. Atualize a página para carregar a versão mais recente.',
  ],
  [
    /conflict|overlap/i,
    () => 'Já existe um agendamento neste horário para este profissional, sala ou equipamento. Escolha outro horário.',
  ],
  [
    /row too big|payload too large|exceeded the maximum allowed size/i,
    () => 'O arquivo ou conteúdo enviado é grande demais. Reduza o tamanho e tente novamente.',
  ],
  [
    /storage.*(not found|object not found)/i,
    () => 'O arquivo não foi encontrado. Ele pode ter sido removido ou renomeado.',
  ],
];

const FIELD_LABELS: Record<string, string> = {
  name: 'nome',
  full_name: 'nome completo',
  email: 'e-mail',
  phone: 'telefone',
  cpf: 'CPF',
  cnpj: 'CNPJ',
  price: 'valor',
  amount: 'valor',
  value: 'valor',
  date: 'data',
  due_date: 'data de vencimento',
  start_time: 'horário de início',
  end_time: 'horário de término',
  duration: 'duração',
  client_id: 'cliente',
  professional_id: 'profissional',
  service_id: 'serviço',
  room_id: 'sala',
  equipment_id: 'equipamento',
  payment_method: 'forma de pagamento',
  account_owner_id: 'conta',
  token: 'token de conexão',
};

function friendlyField(field: string): string {
  return FIELD_LABELS[field.toLowerCase()] ?? field.replace(/_/g, ' ');
}

const GENERIC_FALLBACK =
  'Não foi possível concluir esta ação agora. Verifique os dados informados e tente novamente; se continuar, fale com o suporte.';

/** Mensagem parece técnica (código, SQL, inglês cru)? */
function looksTechnical(message: string): boolean {
  return (
    /[0-9A-Z]{5}\b/.test(message) ||
    /constraint|violates|null value|relation|pgrst|jwt|fetch|non-2xx|exception|sqlstate|duplicate key|row-level|stack|undefined|\[object/i.test(
      message,
    )
  );
}

function extractRaw(input: unknown, depth = 0): HumanErrorInput {
  if (depth > 3 || input == null) return {};
  if (typeof input === 'string') return { message: input };
  if (input instanceof Error) {
    const extra = input as unknown as HumanErrorInput;
    return { message: input.message, code: extra.code, status: extra.status, details: extra.details, hint: extra.hint };
  }
  if (typeof input === 'object') {
    const obj = input as HumanErrorInput;
    if (!obj.message && !obj.code && obj.error) return extractRaw(obj.error, depth + 1);
    return obj;
  }
  return { message: String(input) };
}

/**
 * Converte qualquer erro (string, Error, erro do Supabase/Postgres, resposta
 * HTTP) em uma explicação clara, sem códigos técnicos.
 */
export function humanizeError(input: unknown, fallback = GENERIC_FALLBACK): string {
  const raw = extractRaw(input);
  const message = [raw.message, raw.error_description, raw.details, raw.hint]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(' — ');
  const code = raw.code != null ? String(raw.code) : '';
  const status = raw.status ?? raw.statusCode;

  // 1) Regras lançadas de propósito pelo sistema (P0001 / mensagens em PT-BR):
  //    a mensagem já é explicativa, então preservamos sem o código.
  const isPortuguese = /[çãõáéíóúâêô]|\b(não|você|horário|cliente|pacote|conta)\b/i.test(message);
  if (message && isPortuguese && !looksTechnical(message)) {
    return stripTechnicalNoise(message) || fallback;
  }

  // 2) Padrões técnicos reconhecidos.
  for (const [pattern, build] of PATTERN_MESSAGES) {
    const match = message.match(pattern);
    if (match) return build(match);
  }

  // 3) Código conhecido (Postgres, PostgREST, Auth, HTTP).
  for (const key of [code, status != null ? String(status) : '']) {
    if (!key) continue;
    const mapped = CODE_MESSAGES[key];
    if (mapped) return mapped;
    if (mapped === '' && message) return stripTechnicalNoise(message) || fallback;
  }

  // 4) Mensagem legível em PT-BR mesmo com algum ruído.
  if (message && isPortuguese) {
    const cleaned = stripTechnicalNoise(message);
    if (cleaned && !looksTechnical(cleaned)) return cleaned;
  }

  return fallback;
}

/**
 * Mantém prefixos de contexto ("Erro ao salvar cliente") e substitui a parte
 * técnica pela explicação humanizada.
 */
export function humanizeToastMessage(value: unknown, fallback?: string): unknown {
  if (typeof value === 'number') return humanizeError(String(value), fallback);
  if (typeof value !== 'string') {
    if (value instanceof Error || (value && typeof value === 'object' && ('code' in value || 'message' in value))) {
      return humanizeError(value, fallback);
    }
    return value; // ReactNode customizado — não mexe
  }

  const separator = value.match(/^(.{3,60}?)\s*[:]\s*(.+)$/s);
  if (separator) {
    const prefix = separator[1].trim();
    const rest = separator[2].trim();
    if (looksTechnical(rest) || !/[çãõáéíóúâêô]/i.test(rest)) {
      const explained = humanizeError(rest, fallback);
      return `${prefix}: ${explained}`;
    }
    return `${prefix}: ${stripTechnicalNoise(rest)}`;
  }

  if (looksTechnical(value)) return humanizeError(value, fallback);
  return stripTechnicalNoise(value) || value;
}
