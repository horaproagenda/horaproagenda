// Shared Evolution API client used by WhatsApp edge functions.
// Supports the common Evolution API v2/v6 endpoints used for connection state,
// QR Code generation and direct text message delivery.

export interface EvolutionConfig {
  base: string;
  apiKey: string;
  instance: string;
  configured: boolean;
}

function sanitizeBaseUrl(raw?: string | null): string {
  let value = (raw || '').trim().replace(/^['"]|['"]$/g, '').replace(/\/+$/, '');
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    return new URL(value).origin + new URL(value).pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function getEvolutionConfig(): EvolutionConfig {
  const base = sanitizeBaseUrl(Deno.env.get('EVOLUTION_API_URL'));
  const apiKey = (Deno.env.get('EVOLUTION_API_KEY') || '').trim();
  const instance = (Deno.env.get('EVOLUTION_INSTANCE_NAME') || '').trim();
  return { base, apiKey, instance, configured: Boolean(base && apiKey && instance) };
}

export function normalizeEvolutionPhone(phone: string): string {
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.substring(1);
  if (!digits.startsWith('55') && digits.length <= 11) digits = `55${digits}`;
  return digits;
}

async function evolutionFetch(path: string, init: RequestInit = {}) {
  const cfg = getEvolutionConfig();
  if (!cfg.configured) throw new Error('Evolution API não configurada.');
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
  if (!response.ok || data?.error) {
    throw new Error(`Evolution API ${response.status}: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return data;
}

export async function evolutionStatus() {
  const cfg = getEvolutionConfig();
  if (!cfg.configured) {
    return { configured: false, connected: false, error: 'Evolution API não configurada.' };
  }
  try {
    const data = await evolutionFetch(`/instance/connectionState/${encodeURIComponent(cfg.instance)}`);
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
    return { configured: true, connected: false, instance: cfg.instance, error: msg };
  }
}

export async function evolutionGetQrCode() {
  const cfg = getEvolutionConfig();
  if (!cfg.configured) throw new Error('Evolution API não configurada.');
  const st = await evolutionStatus();
  if (st.connected) return { connected: true, instance: cfg.instance, qrcode: null };

  const data = await evolutionFetch(`/instance/connect/${encodeURIComponent(cfg.instance)}`);
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

export async function evolutionSendText(opts: { to: string; body: string }) {
  const cfg = getEvolutionConfig();
  if (!cfg.configured) throw new Error('Evolution API não configurada.');
  const st = await evolutionStatus();
  if (!st.connected) {
    throw new Error(`WhatsApp não conectado na Evolution API (estado: ${st.state || 'desconhecido'}). Conecte por QR Code em Configurações → WhatsApp.`);
  }
  return evolutionFetch(`/message/sendText/${encodeURIComponent(cfg.instance)}`, {
    method: 'POST',
    body: JSON.stringify({
      number: normalizeEvolutionPhone(opts.to),
      text: opts.body,
      options: { delay: 1200 },
    }),
  });
}