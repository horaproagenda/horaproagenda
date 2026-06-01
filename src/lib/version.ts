// __APP_BUILD_TIME__ is injected at build time by Vite (define).
declare const __APP_BUILD_TIME__: string;

export const APP_VERSION = 'v1.0.2';

export const APP_BUILD_TIME: string =
  typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : new Date().toISOString();

// Curto e legível: ex. "1.0.1 · 08/05 14:32"
export const APP_VERSION_LABEL = (() => {
  try {
    const d = new Date(APP_BUILD_TIME);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${APP_VERSION} · ${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return APP_VERSION;
  }
})();
