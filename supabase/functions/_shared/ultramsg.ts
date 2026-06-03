// Shared UltraMsg client used by all WhatsApp edge functions.
// Docs: https://docs.ultramsg.com/

const DEFAULT_BASE = 'https://api.ultramsg.com';

export function getUltramsgConfig() {
  const base = (Deno.env.get('ULTRAMSG_API_URL') || DEFAULT_BASE).replace(/\/+$/, '');
  const instance = (Deno.env.get('ULTRAMSG_INSTANCE_ID') || '').trim();
  const token = (Deno.env.get('ULTRAMSG_TOKEN') || '').trim();
  return { base, instance, token, configured: Boolean(base && instance && token) };
}

export function normalizeBrPhone(phone: string): string {
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.substring(1);
  if (!digits.startsWith('55') && digits.length <= 11) digits = '55' + digits;
  return digits;
}

export async function ultramsgStatus() {
  const { base, instance, token, configured } = getUltramsgConfig();
  if (!configured) {
    return { configured: false, connected: false, error: 'UltraMsg não configurado. Configure ULTRAMSG_INSTANCE_ID e ULTRAMSG_TOKEN.' };
  }
  const r = await fetch(`${base}/${encodeURIComponent(instance)}/instance/status?token=${encodeURIComponent(token)}`);
  const data = await r.json().catch(() => ({}));
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

export async function ultramsgGetQrCode() {
  const { base, instance, token, configured } = getUltramsgConfig();
  if (!configured) throw new Error('UltraMsg não configurado.');

  // Check if already connected first
  const st = await ultramsgStatus();
  if (st.connected) {
    return { connected: true, instance, qrcode: null };
  }

  // Try JSON endpoint: /instance/qrCode -> { qrCode: "data:image/png;base64,..." }
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

  // Fallback: /instance/qrImage returns the PNG image bytes directly
  const tryImage = async () => {
    const r = await fetch(`${base}/${encodeURIComponent(instance)}/instance/qrImage?token=${encodeURIComponent(token)}`);
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength < 100) return null; // too small to be a QR image
    let bin = '';
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return `data:image/png;base64,${btoa(bin)}`;
  };

  let qrcode: string | null = null;
  try {
    qrcode = await tryJson();
  } catch (e) {
    console.warn('UltraMsg qrCode JSON failed, trying qrImage:', e);
  }
  if (!qrcode) {
    qrcode = await tryImage();
  }

  return { connected: false, instance, qrcode, state: st.state, substatus: st.substatus };
}

export async function ultramsgSendText(opts: { to: string; body: string }) {
  const { base, instance, token, configured } = getUltramsgConfig();
  if (!configured) throw new Error('UltraMsg não configurado.');

  const st = await ultramsgStatus();
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
