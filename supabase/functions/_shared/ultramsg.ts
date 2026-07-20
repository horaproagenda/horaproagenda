// Shared UltraMsg client used by all WhatsApp edge functions.
// Docs: https://docs.ultramsg.com/
// NOTE: `qrcode` is imported lazily inside normalizeQrCodeImage so functions
// that don't render QR codes (e.g. whatsapp-check-connection) don't pay the
// npm boot cost and don't risk BOOT_ERROR when the npm registry is slow.

const DEFAULT_BASE = 'https://api.ultramsg.com';

export interface UltramsgCreds {
  base?: string | null;
  instance: string;
  token: string;
}

export function getUltramsgConfig(override?: UltramsgCreds | null) {
  let base = ((override?.base ?? Deno.env.get('ULTRAMSG_API_URL')) || DEFAULT_BASE).replace(/\/+$/, '');
  let instance = (override?.instance ?? Deno.env.get('ULTRAMSG_INSTANCE_ID') ?? '').trim();
  const token = (override?.token ?? Deno.env.get('ULTRAMSG_TOKEN') ?? '').trim();

  // Caso o usuário tenha salvo a URL inteira no campo instance_id
  // (ex.: "https://api.ultramsg.com/instance179205/"), extrai o segmento
  // instanceN e usa api.ultramsg.com como base.
  const urlMatch = instance.match(/^https?:\/\/([^/]+)\/(?:instance)?(\d+)\/?$/i);
  if (urlMatch) {
    base = `https://${urlMatch[1]}`;
    instance = `instance${urlMatch[2]}`;
  }
  // Também aceita só o número com barras: "/179205/" → "instance179205"
  const bareDigits = instance.match(/^\/?(\d+)\/?$/);
  if (bareDigits) instance = `instance${bareDigits[1]}`;

  // Remove sufixo de instância que tenha sido salvo junto com api_url.
  if (instance) {
    const baseLower = base.toLowerCase();
    const inst = instance.toLowerCase();
    const candidates = new Set<string>([`/${inst}`]);
    const onlyDigits = instance.match(/^(?:instance)?(\d+)$/i);
    if (onlyDigits) {
      candidates.add(`/instance${onlyDigits[1]}`);
      candidates.add(`/${onlyDigits[1]}`);
    }
    for (const suffix of candidates) {
      if (baseLower.endsWith(suffix)) {
        base = base.slice(0, -suffix.length);
        break;
      }
    }
  }
  base = base.replace(/\/+$/, '');
  const instanceSegment = /^instance/i.test(instance) ? instance : `instance${instance}`;
  return { base, instance, instanceSegment, token, configured: Boolean(base && instance && token) };
}

export function normalizeBrPhone(phone: string): string {
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.substring(1);
  if (!digits.startsWith('55') && digits.length <= 11) digits = '55' + digits;
  return digits;
}

/**
 * Resolve UltraMsg credentials for a given professional, falling back to global env.
 * Returns { creds, source: 'professional' | 'global' | 'none' }.
 */
export async function resolveProfessionalCreds(
  supabaseService: any,
  professional_id?: string | null,
): Promise<{ creds: UltramsgCreds | null; source: 'professional' | 'global' | 'none' }> {
  if (professional_id) {
    const { data } = await supabaseService
      .rpc('get_professional_whatsapp_token', { _professional_id: professional_id })
      .maybeSingle();
    if (data?.is_active && data.instance_id && data.token) {
      return {
        creds: { base: data.api_url || null, instance: data.instance_id, token: data.token },
        source: 'professional',
      };
    }
  }

  const env = getUltramsgConfig();
  if (env.configured) {
    return { creds: { base: env.base, instance: env.instance, token: env.token }, source: 'global' };
  }
  return { creds: null, source: 'none' };
}

export async function ultramsgStatus(override?: UltramsgCreds | null) {
  const { base, instance, instanceSegment, token, configured } = getUltramsgConfig(override);
  if (!configured) {
    return { configured: false, connected: false, error: 'UltraMsg não configurado. Configure ULTRAMSG_INSTANCE_ID e ULTRAMSG_TOKEN.' };
  }
  const url = `${base}/${encodeURIComponent(instanceSegment)}/instance/status?token=${encodeURIComponent(token)}`;
  const r = await fetch(url);
  const text = await r.text();
  console.log('[ultramsg.status] HTTP', r.status, 'body:', text.slice(0, 500));
  let data: any = {};
  try { data = JSON.parse(text); } catch { /* ignore */ }
  if (!r.ok) {
    return { configured: true, connected: false, instance, error: data?.error || `UltraMsg HTTP ${r.status}` };
  }
  const acct = data?.accountStatus || data?.status?.accountStatus || data?.status || {};
  const status = (typeof acct === 'string' ? acct : acct?.status) || null;
  const substatus = (typeof acct === 'object' ? acct?.substatus : null) || null;
  const connected = status === 'authenticated' || substatus === 'connected';
  return {
    configured: true,
    connected,
    instance,
    state: status,
    substatus,
    raw: data,
    error: connected ? null : `WhatsApp não conectado (${status || 'desconhecido'})`,
  };
}

function looksLikeImageBase64(value: string): boolean {
  const normalized = value.trim();
  if (!normalized || normalized.length < 100) return false;

  try {
    const prefix = atob(normalized.slice(0, 48));
    return prefix.startsWith('\x89PNG') || prefix.startsWith('\xff\xd8\xff') || prefix.startsWith('GIF8') || prefix.startsWith('RIFF');
  } catch {
    return false;
  }
}

async function normalizeQrCodeImage(qr: string | null | undefined): Promise<string | null> {
  if (!qr || typeof qr !== 'string') return null;
  const value = qr.trim();
  if (!value) return null;
  if (value.startsWith('data:image/')) return value;

  if (looksLikeImageBase64(value)) {
    return `data:image/png;base64,${value}`;
  }

  // UltraMsg can return the WhatsApp QR payload text instead of an image.
  // Render it to a PNG data URL so the browser always receives a real image.
  const { default: QRCode } = await import('npm:qrcode@1.5.4');
  return await QRCode.toDataURL(value, {
    errorCorrectionLevel: 'M',
    margin: 2,
    scale: 8,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
}

export async function ultramsgGetQrCode(override?: UltramsgCreds | null) {
  const { base, instance, instanceSegment, token, configured } = getUltramsgConfig(override);
  if (!configured) throw new Error('UltraMsg não configurado.');

  const st = await ultramsgStatus(override);
  if (st.connected) {
    return { connected: true, instance, qrcode: null };
  }

  const tryJson = async () => {
    const r = await fetch(`${base}/${encodeURIComponent(instanceSegment)}/instance/qrCode?token=${encodeURIComponent(token)}`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `UltraMsg HTTP ${r.status} ao obter QR Code`);
    return await normalizeQrCodeImage(data?.qrCode || data?.qrcode || data?.qr || null);
  };

  const tryImage = async () => {
    const r = await fetch(`${base}/${encodeURIComponent(instanceSegment)}/instance/qrImage?token=${encodeURIComponent(token)}`);
    if (!r.ok) return null;
    const contentType = r.headers.get('content-type') || '';
    if (!contentType.includes('image/')) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength < 100) return null;
    let bin = '';
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return `data:image/png;base64,${btoa(bin)}`;
  };

  let qrcode: string | null = null;
  try { qrcode = await tryJson(); } catch (e) {
    console.warn('UltraMsg qrCode JSON failed, trying qrImage:', e);
  }
  if (!qrcode) qrcode = await tryImage();

  return { connected: false, instance, qrcode, state: st.state, substatus: st.substatus };
}

export async function ultramsgSendText(opts: { to: string; body: string }, override?: UltramsgCreds | null) {
  const { base, instance, instanceSegment, token, configured } = getUltramsgConfig(override);
  if (!configured) throw new Error('UltraMsg não configurado.');

  const st = await ultramsgStatus(override);
  if (!st.connected) {
    throw new Error(`WhatsApp não conectado no UltraMsg (estado: ${st.state || 'desconhecido'}). Conecte por QR Code em Configurações → WhatsApp.`);
  }

  const form = new URLSearchParams();
  form.set('token', token);
  form.set('to', normalizeBrPhone(opts.to));
  form.set('body', opts.body);

  const r = await fetch(`${base}/${encodeURIComponent(instanceSegment)}/messages/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const data = await r.json().catch(async () => ({ raw: await r.text().catch(() => '') }));
  if (!r.ok || data?.error) {
    throw new Error(`UltraMsg ${r.status}: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return data;
}
