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
  _retriedWithEnvKey = false,
): Promise<any> {
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
    // Auto-heal: credencial salva no banco ficou desatualizada em relação ao
    // secret EVOLUTION_API_KEY (rotação da chave na VPS). Refaz a chamada com
    // o valor atual do ambiente antes de falhar.
    const envKey = (Deno.env.get('EVOLUTION_API_KEY') || '').trim();
    const envBase = sanitizeBaseUrl(Deno.env.get('EVOLUTION_API_URL'));
    if (
      response.status === 401 && !_retriedWithEnvKey && envKey &&
      (envKey !== cfg.apiKey || (envBase && envBase !== cfg.base))
    ) {
      return await evolutionFetch(
        path,
        init,
        { ...(override ?? { instance: cfg.instance }), base: envBase || cfg.base, apiKey: envKey },
        true,
      );
    }
    const msg = response.status === 401
      ? `Chave da Evolution API inválida (401). A chave salva em EVOLUTION_API_KEY não corresponde ao AUTHENTICATION_API_KEY do servidor ${cfg.base}. Atualize o segredo com a chave do .env da VPS.`
      : `Evolution API ${response.status}: ${JSON.stringify(data).slice(0, 500)}`;
    const err = new Error(msg);
    (err as any).status = response.status;
    throw err;
  }

  return data;
}


const WEBHOOK_EVENTS = ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'];

function webhookUrl() {
  const base = `${(Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '')}/functions/v1/whatsapp-webhook`;
  // O webhook é público (verify_jwt=false) mas valida um segredo compartilhado:
  // sem o token na URL, o receptor rejeita o evento (fail-closed).
  const token = (Deno.env.get('WHATSAPP_WEBHOOK_TOKEN') || '').trim();
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}


/** Registra/atualiza o webhook da instância (Evolution v2: /webhook/set/{instance}). */
async function evolutionSetWebhook(override: EvolutionCreds) {
  const cfg = getEvolutionConfig(override);
  const payloads = [
    { webhook: { enabled: true, url: webhookUrl(), byEvents: false, base64: false, events: WEBHOOK_EVENTS } },
    { enabled: true, url: webhookUrl(), webhook_by_events: false, events: WEBHOOK_EVENTS },
  ];
  for (const body of payloads) {
    try {
      await evolutionFetch(`/webhook/set/${encodeURIComponent(cfg.instance)}`, {
        method: 'POST', body: JSON.stringify(body),
      }, override);
      return true;
    } catch (_) { /* tenta o próximo formato (v2.0 x v2.2) */ }
  }
  return false;
}

/**
 * Ajusta as configurações da instância para maximizar a estabilidade da
 * sessão (evita quedas poucos minutos após conectar):
 *  - `alwaysOnline`: mantém o socket ativo/presença online;
 *  - `readMessages`/`readStatus` desligados: menos tráfego desnecessário;
 *  - `groupsIgnore`: evita sincronizar grupos (fonte comum de desconexão);
 *  - `syncFullHistory` desligado: sincronização completa derruba a sessão.
 */
export async function evolutionSetSettings(override: EvolutionCreds) {
  const cfg = getEvolutionConfig(override);
  if (!cfg.configured) return false;
  const body = {
    rejectCall: false,
    groupsIgnore: true,
    alwaysOnline: true,
    readMessages: false,
    readStatus: false,
    syncFullHistory: false,
  };
  try {
    await evolutionFetch(`/settings/set/${encodeURIComponent(cfg.instance)}`, {
      method: 'POST', body: JSON.stringify(body),
    }, override);
    return true;
  } catch (_) {
    return false;
  }
}

/** Reinicia o socket da instância reaproveitando a sessão salva (sem novo QR). */
export async function evolutionRestart(override: EvolutionCreds) {
  const cfg = getEvolutionConfig(override);
  if (!cfg.configured) throw new Error('Evolution API não configurada.');
  // v2.2 usa POST; versões anteriores usam PUT. Tenta ambos.
  for (const method of ['POST', 'PUT'] as const) {
    try {
      return await evolutionFetch(`/instance/restart/${encodeURIComponent(cfg.instance)}`, { method }, override);
    } catch (e) {
      if ((e as any)?.status === 401) throw e;
    }
  }
  return null;
}

/**
 * Garante que a instância volte a ficar conectada sem exigir novo QR Code.
 *
 * IMPORTANTE: só reinicia o socket quando o estado é `close` (sessão caiu de
 * fato). Reiniciar durante `connecting` aborta o pareamento em andamento — era
 * exatamente isso que fazia o WhatsApp "conectar e cair poucos minutos depois",
 * porque o polling do app e o cron do keepalive reiniciavam a instância no meio
 * da negociação da sessão.
 */
export async function evolutionEnsureConnected(override: EvolutionCreds) {
  const first = await evolutionStatus(override);
  if (first.connected || first.state === 'not_created') return { ...first, recovered: false };

  // `connecting` = pareamento/negociação em andamento. Apenas aguarda.
  if (first.state === 'connecting') {
    for (const delay of [2000, 3000, 5000]) {
      await new Promise((r) => setTimeout(r, delay));
      const st = await evolutionStatus(override);
      if (st.connected) {
        await evolutionSetSettings(override);
        return { ...st, recovered: true };
      }
      if (st.state && st.state !== 'connecting') break;
    }
    return { ...first, recovered: false, skippedRestart: true };
  }

  try {
    await evolutionRestart(override);
  } catch (_) { /* segue para reconsulta */ }

  const delays = [1500, 2500, 4000];
  for (const delay of delays) {
    await new Promise((r) => setTimeout(r, delay));
    const st = await evolutionStatus(override);
    if (st.connected) {
      await evolutionSetSettings(override);
      return { ...st, recovered: true };
    }
  }
  return { ...first, recovered: false };
}


/** Cria a instância no servidor Evolution (idempotente). */
export async function evolutionEnsureInstance(override: EvolutionCreds) {
  const cfg = getEvolutionConfig(override);
  if (!cfg.configured) throw new Error('Evolution API não configurada.');
  try {
    await evolutionFetch(`/instance/connectionState/${encodeURIComponent(cfg.instance)}`, {}, override);
    return { created: false };
  } catch (e) {
    // 401 = credencial errada; não adianta tentar criar a instância.
    if ((e as any)?.status === 401) throw e;
    // Qualquer outro erro (404) → instância ainda não existe, segue para criar.
  }


  const base = { instanceName: cfg.instance, qrcode: true, integration: 'WHATSAPP-BAILEYS' as const };
  try {
    // Evolution v2.2+: webhook aninhado no create
    await evolutionFetch('/instance/create', {
      method: 'POST',
      body: JSON.stringify({
        ...base,
        webhook: { url: webhookUrl(), byEvents: false, base64: false, events: WEBHOOK_EVENTS },
      }),
    }, override);
  } catch (_) {
    // Versões mais antigas rejeitam o objeto webhook → cria simples e configura depois
    await evolutionFetch('/instance/create', { method: 'POST', body: JSON.stringify(base) }, override);
  }
  await evolutionSetWebhook({ base: cfg.base, apiKey: cfg.apiKey, instance: cfg.instance });
  await evolutionSetSettings({ base: cfg.base, apiKey: cfg.apiKey, instance: cfg.instance });
  return { created: true };
}

/**
 * Estado da conexão da instância.
 * Evolution v2 responde `{ instance: { instanceName, state } }`, onde `state`
 * pode ser `open` (conectado), `connecting` (aguardando QR) ou `close`.
 */
export async function evolutionStatus(override?: EvolutionCreds | null) {
  const cfg = getEvolutionConfig(override);
  if (!cfg.configured) {
    return {
      configured: false,
      connected: false,
      state: null as string | null,
      instance: cfg.instance || null,
      error: 'Evolution API não configurada.',
    };
  }
  try {
    const data: any = await evolutionFetch(
      `/instance/connectionState/${encodeURIComponent(cfg.instance)}`,
      {},
      override,
    );
    const state: string | null = data?.instance?.state ?? data?.state ?? null;
    return {
      configured: true,
      connected: state === 'open',
      state,
      instance: cfg.instance,
      error: state === 'open' ? undefined : 'WhatsApp não conectado. Gere um novo QR Code.',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const notFound = /404/.test(msg);
    return {
      configured: true,
      connected: false,
      state: notFound ? 'not_created' : null,
      instance: cfg.instance,
      error: notFound ? 'Instância ainda não criada. Clique em Conectar ao WhatsApp.' : msg,
    };
  }
}
/**
 * Obtém o QR Code da instância.
 * Evolution v2 responde `{ code, base64, pairingCode, count }` onde:
 *  - `base64` é a imagem PNG (data URL ou base64 puro);
 *  - `code` é o TEXTO do QR (deve ser renderizado como QR no cliente);
 *  - `pairingCode` é o código de pareamento por telefone (8 caracteres).
 */
export async function evolutionGetQrCode(override?: EvolutionCreds | null) {
  const cfg = getEvolutionConfig(override);
  if (!cfg.configured) throw new Error('Evolution API não configurada.');

  await evolutionEnsureInstance({ base: cfg.base, apiKey: cfg.apiKey, instance: cfg.instance });

  const st = await evolutionStatus(override);
  if (st.connected) {
    return { connected: true, instance: cfg.instance, qrcode: null, qrText: null, pairingCode: null };
  }

  const data = await evolutionFetch(`/instance/connect/${encodeURIComponent(cfg.instance)}`, {}, override);

  let qrcode: string | null =
    data?.base64 || data?.qrcode?.base64 || data?.qrcode_base64 || null;
  if (typeof qrcode === 'string' && qrcode && !qrcode.startsWith('data:image')) {
    qrcode = `data:image/png;base64,${qrcode.replace(/^base64,/, '')}`;
  }

  const rawCode = data?.code || data?.qrcode?.code || data?.qr || null;
  const qrText = typeof rawCode === 'string' && rawCode.length > 20 ? rawCode : null;

  const pairing = data?.pairingCode || data?.qrcode?.pairingCode || null;

  return {
    connected: false,
    instance: cfg.instance,
    qrcode,
    qrText,
    pairingCode: typeof pairing === 'string' && pairing.length <= 12 ? pairing : null,
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
