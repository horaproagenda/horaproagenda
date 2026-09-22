// Envio de avisos (Web Push) com criptografia aes128gcm (RFC 8291) e VAPID
// (RFC 8292), usando apenas Web Crypto — sem dependências externas.

const enc = new TextEncoder();

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  type?: string;
}

export function b64urlToBytes(value: string): Uint8Array {
  const pad = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = pad + '='.repeat((4 - (pad.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function bytesToB64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

async function vapidJwt(audience: string, subject: string, publicKey: string, privateKey: string): Promise<string> {
  const pub = b64urlToBytes(publicKey);
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    d: privateKey,
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    ext: true,
  };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = bytesToB64url(enc.encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  })));
  const signingInput = `${header}.${claims}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    enc.encode(signingInput),
  );
  return `${signingInput}.${bytesToB64url(new Uint8Array(signature))}`;
}

async function encryptPayload(
  plaintext: Uint8Array,
  clientPublicKey: Uint8Array,
  clientAuth: Uint8Array,
): Promise<Uint8Array> {
  const localKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const localPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', localKeys.publicKey));
  const clientKey = await crypto.subtle.importKey(
    'raw',
    clientPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientKey },
    localKeys.privateKey,
    256,
  );
  const shared = new Uint8Array(sharedBits);

  const prkInfo = concat(enc.encode('WebPush: info\0'), clientPublicKey, localPublicRaw);
  const prk = await hkdf(clientAuth, shared, prkInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cekBytes = await hkdf(salt, prk, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, prk, enc.encode('Content-Encoding: nonce\0'), 12);

  const cek = await crypto.subtle.importKey('raw', cekBytes, 'AES-GCM', false, ['encrypt']);
  const padded = concat(plaintext, new Uint8Array([0x02]));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, cek, padded),
  );

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);

  return concat(salt, recordSize, new Uint8Array([localPublicRaw.length]), localPublicRaw, cipher);
}

export interface SendResult {
  ok: boolean;
  status: number;
  gone: boolean;
  error?: string;
}

/** Envia um aviso para um aparelho. `gone: true` indica inscrição morta. */
export async function sendWebPush(
  subscription: PushSubscriptionRecord,
  payload: PushPayload,
  vapid: { publicKey: string; privateKey: string; subject: string },
  ttlSeconds = 60 * 60 * 12,
): Promise<SendResult> {
  try {
    const url = new URL(subscription.endpoint);
    const audience = `${url.protocol}//${url.host}`;
    const jwt = await vapidJwt(audience, vapid.subject, vapid.publicKey, vapid.privateKey);
    const body = await encryptPayload(
      enc.encode(JSON.stringify(payload)),
      b64urlToBytes(subscription.p256dh),
      b64urlToBytes(subscription.auth),
    );

    const res = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttlSeconds),
        Urgency: 'high',
        Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
      },
      body,
    });

    if (res.ok) return { ok: true, status: res.status, gone: false };
    const text = await res.text().catch(() => '');
    return {
      ok: false,
      status: res.status,
      gone: res.status === 404 || res.status === 410,
      error: text.slice(0, 300),
    };
  } catch (err) {
    return { ok: false, status: 0, gone: false, error: String(err) };
  }
}

export function readVapidConfig() {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') || '';
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') || '';
  const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:suporte@horaproagenda.app';
  return { publicKey, privateKey, subject, configured: Boolean(publicKey && privateKey) };
}
