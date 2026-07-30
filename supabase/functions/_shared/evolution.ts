// Shared Evolution API client used by WhatsApp edge functions.
//
// Evolution API é open-source e auto-hospedada (gratuita): cada profissional
// ganha a sua própria "instance" no servidor e conecta pelo QR Code.
//
// Config global (secrets do projeto):
//   EVOLUTION_API_URL  -> ex.: https://evo.seudominio.com
//   EVOLUTION_API_KEY  -> AUTHENTICATION_API_KEY global do servidor
//   EVOLUTION_INSTANCE_NAME -> opcional, instância padrão (legado)

export interface EvolutionConfig {
  base: string;
  apiKey: string;
  instance: string;
  configured: boolean;
}

export interface EvolutionCreds {
  base?: string | null;
  apiKey?: string | null;
  instance: string;
}

export function sanitizeBaseUrl(raw?: string | null): string {
  let value = (raw || '').trim().replace(/^['"]|['"]$/g, '').replace(/\/+$/, '');
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    return (url.origin + url.pathname).replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function getEvolutionConfig(override?: EvolutionCreds | null): EvolutionConfig {
  const base = sanitizeBaseUrl(override?.base ?? Deno.env.get('EVOLUTION_API_URL'));
  const apiKey = ((override?.apiKey ?? Deno.env.get('EVOLUTION_API_KEY')) || '').trim();
  const instance = ((override?.instance ?? Deno.env.get('EVOLUTION_INSTANCE_NAME')) || '').trim();
  return { base, apiKey, instance, configured: Boolean(base && apiKey && instance) };
}

/** Servidor Evolution disponível (independente de instância). */
export function evolutionServerConfigured(): boolean {
  return Boolean(
    sanitizeBaseUrl(Deno.env.get('EVOLUTION_API_URL')) &&
    (Deno.env.get('EVOLUTION_API_KEY') || '').trim(),
  );
}

/** Nome determinístico da instância de um profissional. */
export function evolutionInstanceNameFor(professionalId: string): string {
  return `horapro_${(professionalId || '').replace(/-/g, '').slice(0, 24)}`;
}

export function normalizeEvolutionPhone(phone: string): string {
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.substring(1);
  if (!digits.startsWith('55') && digits.length <= 11) digits = `55${digits}`;
  return digits;
}

async function evolutionFetch(
  path: string,
  init: RequestInit = {},
  override?: EvolutionCreds | null,
) {
  const cfg = getEvolutionConfig(override);
  if (!cfg.base || !cfg.apiKey) throw new Error('Evolution API não configurada.');
  const response = await fetch(`${cfg.base}${path}`, {
    ...init,
    headers: {
      apikey: cfg.apiKey,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) {
    const err = new Error(`Evolution API ${response.status}: ${JSON.stringify(data).slice(0, 500)}`);
    (err as any).status = response.status;
    throw err;
  }
  return data;
}

/** Cria a instância no servidor Evolution (idempotente). */
export async function evolutionEnsureInstance(override: EvolutionCreds) {
  const cfg = getEvolutionConfig(override);
  if (!cfg.configured) throw new Error('Evolution API não configurada.');
  try {
    await evolutionFetch(`/instance/connectionState/${encodeURIComponent(cfg.instance)}`, {}, override);
    return { created: false };
  } catch (_) {
    // Instância não existe ainda → cria
  }
  const webhookUrl = `${(Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '')}/functions/v1/whatsapp-webhook`;
  await evolutionFetch('/instance/create', {
    method: 'POST',
    body: JSON.stringify({
      instanceName: cfg.instance,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
      // Webhook para receber respostas (confirmar/cancelar agendamento).
      webhook: {
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
      },
    }),
  }, override);
  return { created: true };
}

export async function evolutionStatus(override?: EvolutionCreds | null) {
  const cfg = getEvolutionConfig(override);
  if (!cfg.configured) {
    return { configured: false, connected: false, error: 'Evolution API não configurada.' };
  }
  try {
    const data = await evolutionFetch(
      `/instance/connectionState/${encodeURIComponent(cfg.instance)}`, {}, override,
    );
    const state = data?.instance?.state || data?.state || data?.status || data?.connectionState || null;
    const connected = state === 'open' || state === 'connected' || data?.connected === true;
    return {
      configured: true,
      connected,
      instance: cfg.instance,
      state,
      raw: data,
      error: connected ? null : `WhatsApp não conectado na Evolution API (${state || 'desconhecido'})`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return { configured: true, connected: false, instance: cfg.instance, state: null, error: msg };
  }
}

export async function evolutionGetQrCode(override?: EvolutionCreds | null) {
  const cfg = getEvolutionConfig(override);
  if (!cfg.configured) throw new Error('Evolution API não configurada.');

  await evolutionEnsureInstance({ base: cfg.base, apiKey: cfg.apiKey, instance: cfg.instance });

  const st = await evolutionStatus(override);
  if (st.connected) return { connected: true, instance: cfg.instance, qrcode: null, pairingCode: null };

  const data = await evolutionFetch(`/instance/connect/${encodeURIComponent(cfg.instance)}`, {}, override);
  let qrcode: string | null = data?.base64 || data?.qrcode?.base64 || data?.qrcode || data?.qr || null;
  if (qrcode && typeof qrcode === 'string' && !qrcode.startsWith('data:image')) {
    qrcode = `data:image/png;base64,${qrcode}`;
  }
  return {
    connected: false,
    instance: cfg.instance,
    qrcode,
    pairingCode: data?.pairingCode || data?.code || data?.qrcode?.pairingCode || null,
    raw: data,
  };
}

export async function evolutionLogout(override: EvolutionCreds) {
  const cfg = getEvolutionConfig(override);
  if (!cfg.configured) throw new Error('Evolution API não configurada.');
  return evolutionFetch(`/instance/logout/${encodeURIComponent(cfg.instance)}`, { method: 'DELETE' }, override);
}

export async function evolutionSendText(
  opts: { to: string; body: string },
  override?: EvolutionCreds | null,
) {
  const cfg = getEvolutionConfig(override);
  if (!cfg.configured) throw new Error('Evolution API não configurada.');
  const st = await evolutionStatus(override);
  if (!st.connected) {
    throw new Error(`WhatsApp não conectado (estado: ${st.state || 'desconhecido'}). Conecte por QR Code em Configurações → WhatsApp.`);
  }
  return evolutionFetch(`/message/sendText/${encodeURIComponent(cfg.instance)}`, {
    method: 'POST',
    body: JSON.stringify({
      number: normalizeEvolutionPhone(opts.to),
      text: opts.body,
      delay: 1200,
    }),
  }, override);
}
