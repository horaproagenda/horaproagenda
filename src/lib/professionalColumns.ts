/**
 * Colunas do profissional legíveis por qualquer usuário da clínica.
 *
 * Os campos sensíveis (CPF, CNPJ, data de nascimento, endereço e dados de
 * recebimento) NÃO podem ser lidos pela tabela: a leitura desses campos foi
 * revogada no banco e só é possível via `get_professional_sensitive_data`,
 * que exige administrador da clínica ou o próprio profissional.
 *
 * Por isso, nunca use `select('*')` em `professionals`.
 */
export const PROFESSIONAL_SAFE_COLUMNS = [
  'id',
  'name',
  'email',
  'phone',
  'specialties',
  'bio',
  'avatar_url',
  'is_active',
  'created_at',
  'updated_at',
  'agenda_color',
  'app_role',
  'is_commission_based',
  'commission_percentage',
  'updated_by',
  'user_id',
  'permissions',
  'commission_type',
  'commission_fixed_value',
  'commission_frequency',
  'commission_payment_day',
  'company_name',
  'whatsapp_from_number',
  'quiet_hours_start',
  'quiet_hours_end',
  'account_owner_id',
  'whatsapp_release_approved',
  'whatsapp_release_approved_at',
  'whatsapp_release_approved_by',
  'allowed_room_ids',
  'allowed_equipment_ids',
  'employment_type',
  'public_code',
].join(', ');

/** Mesma lista, no formato aceito em embeds do PostgREST. */
export const PROFESSIONAL_SAFE_EMBED = PROFESSIONAL_SAFE_COLUMNS;

export interface ProfessionalSensitiveData {
  cpf: string | null;
  cnpj: string | null;
  birthdate: string | null;
  cep: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  beneficiary_address: string | null;
  beneficiary_cep: string | null;
  beneficiary_city: string | null;
  beneficiary_state: string | null;
}

/**
 * Busca os campos sensíveis de um profissional. Retorna null quando o usuário
 * não tem autorização (administrador da clínica ou o próprio profissional).
 */
export async function fetchProfessionalSensitiveData(
  client: { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
  professionalId: string,
): Promise<Partial<ProfessionalSensitiveData>> {
  const { data, error } = await client.rpc('get_professional_sensitive_data', {
    _professional_id: professionalId,
  });
  if (error || !data) return {};
  return data as Partial<ProfessionalSensitiveData>;
}
