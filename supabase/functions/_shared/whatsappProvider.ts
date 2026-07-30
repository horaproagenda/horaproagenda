// Dispatcher único de WhatsApp: escolhe entre Evolution API (auto-hospedada,
// gratuita, conexão por QR Code) e UltraMsg (legado / pool pago), conforme o
// provedor salvo em professional_whatsapp_credentials.provider.
import {
  evolutionServerConfigured,
  evolutionInstanceNameFor,
  evolutionEnsureInstance,
  evolutionGetQrCode,
  evolutionStatus,
  evolutionSendText,
  evolutionLogout,
  sanitizeBaseUrl,
  type EvolutionCreds,
} from './evolution.ts';
import {
  ultramsgStatus,
  ultramsgSendText,
  ultramsgGetQrCode,
  type UltramsgCreds,
} from './ultramsg.ts';

export type WhatsappProvider = 'evolution' | 'ultramsg';

export interface ResolvedWhatsapp {
  provider: WhatsappProvider;
  source: 'professional' | 'none';
  evolution?: EvolutionCreds;
  ultramsg?: UltramsgCreds;
}

/** Provedor preferido para novas conexões: Evolution quando o servidor existe. */
export function preferredProvider(): WhatsappProvider {
  return evolutionServerConfigured() ? 'evolution' : 'ultramsg';
}

export async function resolveWhatsapp(
  supabaseService: any,
  professional_id?: string | null,
): Promise<ResolvedWhatsapp> {
  if (professional_id) {
    const { data } = await supabaseService
      .rpc('get_professional_whatsapp_token', { _professional_id: professional_id })
      .maybeSingle();

    if (data?.is_active && data.instance_id) {
      const provider: WhatsappProvider = data.provider === 'evolution' ? 'evolution' : 'ultramsg';
      if (provider === 'evolution') {
        return {
          provider,
          source: 'professional',
          evolution: {
            base: data.api_url || Deno.env.get('EVOLUTION_API_URL') || null,
            apiKey: data.token || Deno.env.get('EVOLUTION_API_KEY') || null,
            instance: data.instance_id,
          },
        };
      }
      if (data.token) {
        return {
          provider: 'ultramsg',
          source: 'professional',
          ultramsg: { base: data.api_url || null, instance: data.instance_id, token: data.token },
        };
      }
    }
  }
  return { provider: preferredProvider(), source: 'none' };
}

/**
 * Garante uma instância Evolution própria para o profissional e persiste as
 * credenciais. Não expõe nenhuma credencial ao cliente.
 */
export async function provisionEvolutionInstance(
  supabaseService: any,
  professional_id: string,
): Promise<EvolutionCreds> {
  const base = sanitizeBaseUrl(Deno.env.get('EVOLUTION_API_URL'));
  const apiKey = (Deno.env.get('EVOLUTION_API_KEY') || '').trim();
  if (!base || !apiKey) throw new Error('Servidor Evolution API não configurado.');

  const { data: existing } = await supabaseService
    .from('professional_whatsapp_credentials')
    .select('instance_id, provider')
    .eq('professional_id', professional_id)
    .maybeSingle();

  const instance = existing?.provider === 'evolution' && existing?.instance_id
    ? existing.instance_id
    : evolutionInstanceNameFor(professional_id);

  const creds: EvolutionCreds = { base, apiKey, instance };
  await evolutionEnsureInstance(creds);

  const { error } = await supabaseService
    .from('professional_whatsapp_credentials')
    .upsert({
      professional_id,
      provider: 'evolution',
      api_url: base,
      instance_id: instance,
      token: apiKey,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'professional_id' });
  if (error) throw new Error(error.message);

  return creds;
}

export async function whatsappStatus(resolved: ResolvedWhatsapp) {
  if (resolved.provider === 'evolution') return evolutionStatus(resolved.evolution ?? null);
  return ultramsgStatus(resolved.ultramsg ?? null);
}

export async function whatsappQrCode(resolved: ResolvedWhatsapp) {
  if (resolved.provider === 'evolution') return evolutionGetQrCode(resolved.evolution ?? null);
  return ultramsgGetQrCode(resolved.ultramsg ?? null);
}

export async function whatsappSendText(resolved: ResolvedWhatsapp, opts: { to: string; body: string }) {
  if (resolved.provider === 'evolution') return evolutionSendText(opts, resolved.evolution ?? null);
  return ultramsgSendText({ to: opts.to, body: opts.body }, resolved.ultramsg ?? null);
}

export async function whatsappDisconnect(resolved: ResolvedWhatsapp) {
  if (resolved.provider === 'evolution' && resolved.evolution) {
    return evolutionLogout(resolved.evolution);
  }
  return null;
}
