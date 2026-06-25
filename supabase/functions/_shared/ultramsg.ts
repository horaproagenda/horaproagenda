// Shared UltraMsg client used by all WhatsApp edge functions.
// Docs: https://docs.ultramsg.com/

const DEFAULT_BASE = 'https://api.ultramsg.com';

export interface UltramsgCreds {
  base?: string | null;
  instance: string;
  token: string;
}

export function getUltramsgConfig(override?: UltramsgCreds | null) {
  let base = ((override?.base ?? Deno.env.get('ULTRAMSG_API_URL')) || DEFAULT_BASE).replace(/\/+$/, '');
  const instance = (override?.instance ?? Deno.env.get('ULTRAMSG_INSTANCE_ID') ?? '').trim();
  const token = (override?.token ?? Deno.env.get('ULTRAMSG_TOKEN') ?? '').trim();

  // Normaliza a base removendo qualquer sufixo de instância que já tenha
  // sido salvo junto com api_url (causa raiz do "Path not found").
  // Cobre os formatos comuns: /<instance>, /instance<digits>, /<digits>.
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
  // Garante que api.ultramsg.com nunca fique com path sobrando.
  base = base.replace(/\/+$/, '');
  return { base, instance, token, configured: Boolean(base && instance && token) };
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
      .from('professional_whatsapp_credentials')
      .select('api_url, instance_id, token, is_active')
      .eq('professional_id', professional_id)
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
  const { base, instance, token, configured } = getUltramsgConfig(override);
  if (!configured) {
    return { configured: false, connected: false, error: 'UltraMsg não configurado. Configure ULTRAMSG_INSTANCE_ID e ULTRAMSG_TOKEN.' };
  }
  const url = `${base}/${encodeURIComponent(instance)}/instance/status?token=${encodeURIComponent(token)}`;
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

export async function ultramsgGetQrCode(override?: UltramsgCreds | null) {
  const { base, instance, token, configured } = getUltramsgConfig(override);
  if (!configured) throw new Error('UltraMsg não configurado.');

  const st = await ultramsgStatus(override);
  if (st.connected) {
    return { connected: true, instance, qrcode: null };
  }

  const tryJson = async () => {
    const r = await fetch(`${base}/${encodeURIComponent(instance)}/instance/qrCode?token=${encodeURIComponent(token)}`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `UltraMsg HTTP ${r.status} ao obter QR Code`);
    let q: string | null = data?.qrCode || data?.qrcode || null;
    if (q && typeof q === 'string' && !q.startsWith('data:image')) {
      q = `data:image/png;base64,${q}`;
    }
    return q;
  };

  const tryImage = async () => {
    const r = await fetch(`${base}/${encodeURIComponent(instance)}/instance/qrImage?token=${encodeURIComponent(token)}`);
    if (!r.ok) return null;
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
  const { base, instance, token, configured } = getUltramsgConfig(override);
  if (!configured) throw new Error('UltraMsg não configurado.');

  const st = await ultramsgStatus(override);
  if (!st.connected) {
    throw new Error(`WhatsApp não conectado no UltraMsg (estado: ${st.state || 'desconhecido'}). Conecte por QR Code em Configurações → WhatsApp.`);
  }

  const form = new URLSearchParams();
  form.set('token', token);
  form.set('to', normalizeBrPhone(opts.to));
  form.set('body', opts.body);

  const r = await fetch(`${base}/${encodeURIComponent(instance)}/messages/chat`, {
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
