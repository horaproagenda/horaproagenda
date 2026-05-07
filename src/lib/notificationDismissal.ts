// Persistent notification dismissal helpers.
// Dismissals are stored in BOTH localStorage (for instant UI) AND the database
// (so they persist across devices/sessions and survive cache clears).
// A notification only re-appears if its content signature changes.

import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'dismissed_notification_signatures_v2';
const SESSION_TOAST_KEY = 'notifications_session_shown';

type DismissedMap = Record<string, string>; // id -> signature

function readMap(): DismissedMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: DismissedMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

export function isNotificationDismissed(id: string, signature: string): boolean {
  const map = readMap();
  return map[id] === signature;
}

async function persistToDb(items: Array<{ id: string; signature: string }>) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const rows = items.map(item => ({
      user_id: user.id,
      notification_id: item.id,
      signature: item.signature,
      dismissed_at: new Date().toISOString(),
    }));
    await supabase
      .from('dismissed_notifications')
      .upsert(rows, { onConflict: 'user_id,notification_id' });
  } catch (err) {
    console.warn('Failed to persist dismissed notifications to DB', err);
  }
}

export function dismissNotification(id: string, signature: string) {
  const map = readMap();
  map[id] = signature;
  writeMap(map);
  void persistToDb([{ id, signature }]);
}

export function dismissNotifications(items: Array<{ id: string; signature: string }>) {
  const map = readMap();
  for (const item of items) {
    map[item.id] = item.signature;
  }
  writeMap(map);
  if (items.length > 0) void persistToDb(items);
}

export function clearAllDismissals() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// Hydrate localStorage from DB on app start so dismissals follow the user
// across devices and survive cache clears.
let hydrated = false;
export async function hydrateDismissalsFromDb(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from('dismissed_notifications')
      .select('notification_id, signature')
      .eq('user_id', user.id);
    if (error || !data) return;
    const map = readMap();
    for (const row of data) {
      map[row.notification_id] = row.signature;
    }
    writeMap(map);
  } catch (err) {
    console.warn('Failed to hydrate dismissed notifications from DB', err);
  }
}

// Session toast tracking (so app-open toasts only show once per browser session)
export function wasShownThisSession(): boolean {
  return sessionStorage.getItem(SESSION_TOAST_KEY) === 'true';
}

export function markShownThisSession() {
  sessionStorage.setItem(SESSION_TOAST_KEY, 'true');
}
