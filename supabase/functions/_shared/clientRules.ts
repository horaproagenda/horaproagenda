/**
 * REGRAS ÚNICAS DE CADASTRO DE CLIENTES.
 *
 * Este arquivo é a fonte da verdade para validar e normalizar clientes em
 * todos os pontos de entrada (cadastro manual, link público, importação em
 * massa e funções do servidor). Ele é espelhado byte a byte em
 * `supabase/functions/_shared/clientRules.ts` — um teste garante que as duas
 * cópias continuem idênticas. Não use dependências externas aqui.
 */

export const UF_LIST = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export interface ClientInput {
  person_type?: 'pf' | 'pj' | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
  company_name?: string | null;
  birthdate?: string | null;
  notes?: string | null;
  referral_source?: string | null;
  complementary_info?: string | null;
  assigned_professional_id?: string | null;
  cep?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
}

export interface ClientFieldError {
  field: string;
  message: string;
}

export interface ClientValidationOptions {
  /** Exige CPF (pessoa física) ou CNPJ (pessoa jurídica) — usado no link público. */
  requireDocument?: boolean;
}

export const onlyDigits = (v: string | null | undefined): string => (v || '').replace(/\D/g, '');

export function isValidCPF(cpf: string | null | undefined): boolean {
  const c = onlyDigits(cpf);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(c[i]) * (10 - i);
  let r = (s * 10) % 11;
  if (r >= 10) r = 0;
  if (r !== parseInt(c[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(c[i]) * (11 - i);
  r = (s * 10) % 11;
  if (r >= 10) r = 0;
  return r === parseInt(c[10]);
}

export const isValidCNPJ = (cnpj: string | null | undefined): boolean => onlyDigits(cnpj).length === 14;
export const isValidPhone = (p: string | null | undefined): boolean => {
  const d = onlyDigits(p);
  return d.length >= 10 && d.length <= 11;
};
export const isValidEmail = (e: string | null | undefined): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || '').trim());

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? '').toString().trim();
  return t.length ? t : null;
};

export function validateClientInput(input: ClientInput, opts: ClientValidationOptions = {}): ClientFieldError[] {
  const errors: ClientFieldError[] = [];
  const isPJ = input.person_type === 'pj';
  const name = (input.name || '').trim();
  if (name.length < 2) errors.push({ field: 'name', message: 'Informe o nome completo (mínimo 2 letras).' });
  else if (name.length > 255) errors.push({ field: 'name', message: 'Nome muito longo.' });

  if (!clean(input.phone)) errors.push({ field: 'phone', message: 'Informe o telefone.' });
  else if (!isValidPhone(input.phone)) errors.push({ field: 'phone', message: 'Telefone inválido. Use DDD + número.' });

  if (clean(input.email) && !isValidEmail(input.email)) errors.push({ field: 'email', message: 'E-mail inválido.' });

  if (opts.requireDocument) {
    if (isPJ) {
      if (!isValidCNPJ(input.cnpj)) errors.push({ field: 'cnpj', message: 'CNPJ inválido (14 dígitos).' });
    } else if (!isValidCPF(input.cpf)) {
      errors.push({ field: 'cpf', message: 'CPF inválido.' });
    }
  } else {
    if (clean(input.cpf) && !isValidCPF(input.cpf)) errors.push({ field: 'cpf', message: 'CPF inválido.' });
    if (clean(input.cnpj) && !isValidCNPJ(input.cnpj)) errors.push({ field: 'cnpj', message: 'CNPJ inválido (14 dígitos).' });
  }

  const cep = onlyDigits(input.cep);
  if (cep.length !== 0 && cep.length !== 8) errors.push({ field: 'cep', message: 'CEP deve ter 8 dígitos.' });

  const uf = clean(input.address_state);
  if (uf && !UF_LIST.includes(uf.toUpperCase())) errors.push({ field: 'address_state', message: 'UF inválida.' });

  const birth = clean(input.birthdate);
  if (birth) {
    const d = new Date(birth.length === 10 ? `${birth}T12:00:00` : birth);
    if (isNaN(d.getTime()) || d > new Date()) errors.push({ field: 'birthdate', message: 'Data de nascimento inválida.' });
  }

  if ((input.notes || '').length > 5000) errors.push({ field: 'notes', message: 'Observações muito longas.' });
  return errors;
}

/** Converte a entrada no formato gravado na tabela de clientes. */
export function normalizeClientInput(input: ClientInput) {
  const isPJ = input.person_type === 'pj';
  const cpf = onlyDigits(input.cpf);
  const cnpj = onlyDigits(input.cnpj);
  const cep = onlyDigits(input.cep);
  const uf = clean(input.address_state);
  return {
    name: (input.name || '').trim(),
    phone: onlyDigits(input.phone),
    email: clean(input.email)?.toLowerCase() ?? null,
    cpf: !isPJ && cpf ? cpf : null,
    cnpj: (isPJ || !input.person_type) && cnpj ? cnpj : null,
    company_name: clean(input.company_name),
    birthdate: !isPJ ? clean(input.birthdate) : null,
    notes: clean(input.notes),
    referral_source: clean(input.referral_source),
    complementary_info: clean(input.complementary_info),
    assigned_professional_id: clean(input.assigned_professional_id),
    cep: cep || null,
    address_street: clean(input.address_street),
    address_number: clean(input.address_number),
    address_complement: clean(input.address_complement),
    address_neighborhood: clean(input.address_neighborhood),
    address_city: clean(input.address_city),
    address_state: uf ? uf.toUpperCase() : null,
  };
}

export type NormalizedClient = ReturnType<typeof normalizeClientInput>;

/** Mensagem única de duplicidade, igual em todas as telas. */
export function duplicateClientMessage(field: 'phone' | 'cpf' | 'cnpj', existingName?: string | null): string {
  const label = field === 'phone' ? 'Este telefone' : field === 'cpf' ? 'Este CPF' : 'Este CNPJ';
  return existingName ? `${label} já está cadastrado para ${existingName}.` : `${label} já está cadastrado.`;
}
