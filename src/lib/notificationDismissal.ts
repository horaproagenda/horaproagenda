// Persistent notification dismissal helpers.
// Notifications are dismissed by a "signature" composed of id + content hash,
// so they only re-appear when the underlying data changes (e.g. stock dropped further,
// new sessions remaining, etc.). Dismissals persist across days/sessions until
// the signature changes or the user explicitly resets.

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

export function dismissNotification(id: string, signature: string) {
  const map = readMap();
  map[id] = signature;
  writeMap(map);
}

export function dismissNotifications(items: Array<{ id: string; signature: string }>) {
  const map = readMap();
  for (const item of items) {
    map[item.id] = item.signature;
  }
  writeMap(map);
}

export function clearAllDismissals() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// Session toast tracking (so app-open toasts only show once per browser session)
export function wasShownThisSession(): boolean {
  return sessionStorage.getItem(SESSION_TOAST_KEY) === 'true';
}

export function markShownThisSession() {
  sessionStorage.setItem(SESSION_TOAST_KEY, 'true');
}
