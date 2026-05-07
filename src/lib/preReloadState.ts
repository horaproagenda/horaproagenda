/**
 * preReloadState
 *
 * Captura a "tela atual" (URL completa: pathname + search + hash) e o
 * conteúdo de todos os formulários abertos antes de um reload acionado
 * por uma atualização do app. Após o reload, restaura automaticamente:
 *  - a rota e o scroll
 *  - os valores dos inputs/textareas/selects (matched por name/id)
 *
 * Isso evita que o usuário perca o que estava digitando quando uma
 * nova versão é baixada.
 */
import { logVersionEvent } from './appVersionLog';

const STORAGE_KEY = 'app_pre_reload_state_v1';
const MAX_AGE_MS = 5 * 60 * 1000; // 5 min

interface FieldSnapshot {
  key: string; // form-id::field-key
  value: string;
  checked?: boolean;
  type: string;
}

interface PreReloadSnapshot {
  ts: number;
  url: string;
  scrollX: number;
  scrollY: number;
  fields: FieldSnapshot[];
  reason?: string;
}

function fieldKey(form: HTMLFormElement | null, el: HTMLElement): string | null {
  const name = (el as HTMLInputElement).name || el.id;
  if (!name) return null;
  const formId = form?.id || form?.getAttribute('data-form-id') || 'global';
  return `${formId}::${name}`;
}

export function captureFormState(reason?: string) {
  try {
    const fields: FieldSnapshot[] = [];
    const inputs = document.querySelectorAll<HTMLElement>('input, textarea, select');
    inputs.forEach((el) => {
      const form = (el as HTMLInputElement).form ?? null;
      const key = fieldKey(form, el);
      if (!key) return;
      const tag = el.tagName.toLowerCase();
      const type = (el as HTMLInputElement).type || tag;
      // Ignora campos sensíveis
      if (type === 'password' || type === 'hidden' || type === 'file') return;
      if (tag === 'input' && (type === 'checkbox' || type === 'radio')) {
        fields.push({
          key,
          value: (el as HTMLInputElement).value,
          checked: (el as HTMLInputElement).checked,
          type,
        });
      } else {
        const val = (el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
        if (val == null || val === '') return;
        fields.push({ key, value: String(val), type });
      }
    });

    const snapshot: PreReloadSnapshot = {
      ts: Date.now(),
      url: window.location.pathname + window.location.search + window.location.hash,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      fields,
      reason,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    logVersionEvent('state_preserved', {
      fieldCount: fields.length,
      url: snapshot.url,
      reason,
    });
  } catch (e) {
    console.warn('[preReloadState] capture failed', e);
  }
}

function readSnapshot(): PreReloadSnapshot | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PreReloadSnapshot;
    if (!parsed?.ts || Date.now() - parsed.ts > MAX_AGE_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Chame logo no boot para restaurar a rota (antes do React Router montar
 * usaremos history.replaceState para que o Router já inicialize na URL certa).
 */
export function restoreUrlIfNeeded() {
  const snap = readSnapshot();
  if (!snap) return;
  try {
    const current = window.location.pathname + window.location.search + window.location.hash;
    if (current !== snap.url) {
      window.history.replaceState(null, '', snap.url);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Após o app montar, restaura formulários e scroll. Tenta múltiplas vezes
 * porque os formulários podem montar de forma assíncrona.
 */
export function scheduleFormRestore() {
  const snap = readSnapshot();
  if (!snap) return;

  let attempts = 0;
  const maxAttempts = 20; // ~10s

  const tryRestore = () => {
    attempts += 1;
    let restored = 0;

    snap.fields.forEach((field) => {
      const [formId, fieldName] = field.key.split('::');
      const scope =
        formId !== 'global' ? document.getElementById(formId) ?? document : document;
      const selector = `[name="${cssEscape(fieldName)}"], #${cssEscape(fieldName)}`;
      const el = (scope as ParentNode).querySelector<HTMLInputElement>(selector);
      if (!el) return;
      try {
        if (field.type === 'checkbox' || field.type === 'radio') {
          el.checked = !!field.checked;
        } else if (!el.value) {
          el.value = field.value;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        restored += 1;
      } catch {
        /* ignore individual */
      }
    });

    if (restored > 0 || attempts >= maxAttempts) {
      try {
        window.scrollTo(snap.scrollX, snap.scrollY);
      } catch {
        /* ignore */
      }
      sessionStorage.removeItem(STORAGE_KEY);
      logVersionEvent('state_restored', {
        attempted: snap.fields.length,
        restored,
        url: snap.url,
      });
      return;
    }
    setTimeout(tryRestore, 500);
  };

  // Espera primeiro frame
  setTimeout(tryRestore, 600);
}

function cssEscape(s: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s);
  return s.replace(/["\\]/g, '\\$&');
}
