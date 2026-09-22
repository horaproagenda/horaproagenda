/**
 * Avisos no celular/tablet (Web Push).
 *
 * Funciona com o aplicativo fechado porque quem recebe o aviso é o service
 * worker do app. No iPhone/iPad é obrigatório ter salvo o Hora Pro na tela
 * inicial antes de pedir permissão (regra da Apple).
 */
import { supabase } from '@/integrations/supabase/client';

export type PushSupportState =
  | 'supported'
  | 'unsupported'
  | 'needs-install' // iOS/iPadOS: só funciona depois de salvar na tela inicial
  | 'blocked'; // usuário negou a permissão no aparelho

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isIOS(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);
}

export function getPushSupportState(): PushSupportState {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIOS() ? 'needs-install' : 'unsupported';
  }
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (Notification.permission === 'denied') return 'blocked';
  return 'supported';
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function bufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getPublicKey(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('push-dispatch', { body: { mode: 'config' } });
  if (error) throw error;
  const key = (data as { publicKey?: string; configured?: boolean } | null)?.publicKey;
  if (!key) throw new Error('push_not_configured');
  return key;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return navigator.serviceWorker.ready;
}

/** Já existe um aparelho inscrito neste navegador? */
export async function isDeviceSubscribed(): Promise<boolean> {
  if (getPushSupportState() !== 'supported') return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    return Boolean(subscription);
  } catch {
    return false;
  }
}

/** Pede permissão, inscreve este aparelho e guarda no banco. */
export async function enableDevicePush(): Promise<{ ok: boolean; reason?: string }> {
  const state = getPushSupportState();
  if (state !== 'supported') return { ok: false, reason: state };

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'blocked' };

  const publicKey = await getPublicKey();
  const registration = await getRegistration();

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'no-session' };

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: user.id,
    endpoint: subscription.endpoint,
    p256dh: bufferToBase64Url(subscription.getKey('p256dh')),
    auth: bufferToBase64Url(subscription.getKey('auth')),
    user_agent: navigator.userAgent.slice(0, 300),
    enabled: true,
    failure_count: 0,
  }, { onConflict: 'endpoint' });
  if (error) throw error;

  return { ok: true };
}

/** Remove este aparelho da lista de avisos. */
export async function disableDevicePush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
    await subscription.unsubscribe();
  }
}

/** Envia um aviso de teste para os aparelhos do próprio usuário. */
export async function sendTestPush(): Promise<{ sent: number; skipped?: string }> {
  const { data, error } = await supabase.functions.invoke('push-dispatch', { body: { mode: 'test' } });
  if (error) throw error;
  return (data as { sent: number; skipped?: string }) ?? { sent: 0 };
}
