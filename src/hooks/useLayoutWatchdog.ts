import { useEffect } from 'react';
import { logSyncEvent } from '@/lib/syncAudit';

/**
 * Detects layout regressions that cause large dead/white space inside
 * the app's main scroll container (the kind of "barra em branco" that
 * makes pages feel broken on notebooks with shorter viewports).
 *
 * - Runs on resize, route changes and periodically.
 * - Logs a warning via syncAudit when dead space > 25% of viewport.
 * - Exposes window.__layoutWatchdogCheck() for manual debugging.
 */
export function useLayoutWatchdog() {
  useEffect(() => {
    let lastReport = 0;
    const THROTTLE_MS = 10_000;

    const check = (trigger: string) => {
      const main = document.querySelector('main') as HTMLElement | null;
      if (!main) return;
      const rect = main.getBoundingClientRect();
      const usable = main.scrollHeight;
      const visible = rect.height;
      // dead space = main visible height vs. the largest direct child
      const lastChild = main.lastElementChild as HTMLElement | null;
      const lastBottom = lastChild ? lastChild.getBoundingClientRect().bottom : rect.bottom;
      const dead = Math.max(0, rect.bottom - lastBottom);
      const ratio = visible > 0 ? dead / visible : 0;

      if (ratio > 0.25 && dead > 120) {
        const now = Date.now();
        if (now - lastReport < THROTTLE_MS) return;
        lastReport = now;
        logSyncEvent('layout-watchdog:dead-space', 'skipped', {
          trigger,
          deadPx: Math.round(dead),
          mainHeight: Math.round(visible),
          contentHeight: Math.round(usable),
          path: window.location.pathname,
        });
        // Add a marker class so devs can spot it in the DOM
        main.dataset.layoutWarn = 'dead-space';
      } else {
        if (main.dataset.layoutWarn) delete main.dataset.layoutWarn;
      }
    };

    const onResize = () => check('resize');
    const onNav = () => setTimeout(() => check('nav'), 300);

    window.addEventListener('resize', onResize);
    window.addEventListener('popstate', onNav);
    const interval = window.setInterval(() => check('interval'), 15_000);
    const boot = window.setTimeout(() => check('boot'), 2000);

    (window as unknown as Record<string, unknown>).__layoutWatchdogCheck = () => check('manual');

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('popstate', onNav);
      window.clearInterval(interval);
      window.clearTimeout(boot);
    };
  }, []);
}
