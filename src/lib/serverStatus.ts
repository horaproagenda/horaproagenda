/** Estado de disponibilidade do servidor de dados, compartilhado pelo app. */
type Listener = (down: boolean) => void;
let down = false;
const listeners = new Set<Listener>();

export const isServerDown = () => down;
export function setServerDown(value: boolean) {
  if (down === value) return;
  down = value;
  listeners.forEach((l) => l(value));
}
export function subscribeServerStatus(l: Listener) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('SERVER_TIMEOUT')), ms);
    Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

const PROFILE_CACHE = 'hp:auth-profile-cache:';
export function saveAuthCache(userId: string, profile: unknown, roles: string[]) {
  try { localStorage.setItem(PROFILE_CACHE + userId, JSON.stringify({ profile, roles })); } catch { /* ignore */ }
}
export function readAuthCache(userId: string): { profile: unknown; roles: string[] } | null {
  try { const raw = localStorage.getItem(PROFILE_CACHE + userId); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
