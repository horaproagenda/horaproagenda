import { test, expect, devices } from '@playwright/test';

/**
 * Validates that tapping any Sidebar item on mobile navigates to the
 * correct route on both iPhone and Android viewports.
 *
 * Skipped automatically when the sandbox is running without an injected
 * Supabase session (LOVABLE_BROWSER_AUTH_STATUS != "injected"), since the
 * sidebar only renders behind ProtectedRoute.
 */
const MOBILE_ROUTES = [
  '/', '/agenda', '/clientes', '/servicos', '/cadastros', '/caixa',
  '/financeiro', '/produtos', '/lembretes', '/documentos', '/relatorios',
  '/configuracoes', '/ajuda', '/suporte',
];

const authInjected = process.env.LOVABLE_BROWSER_AUTH_STATUS === 'injected';

async function restoreSession(context) {
  const cookiesJson = process.env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON;
  if (cookiesJson) {
    const cookies = JSON.parse(cookiesJson).map((c) => ({ ...c, url: 'http://localhost:8080' }));
    await context.addCookies(cookies);
  }
}

for (const deviceName of ['iPhone 14 Pro', 'Pixel 7']) {
  test.describe(`Sidebar navigation on ${deviceName}`, () => {
    test.skip(!authInjected, 'Requires managed Supabase session');
    test.use({ ...devices[deviceName] });

    test.beforeEach(async ({ context, page }) => {
      await restoreSession(context);
      await page.goto('http://localhost:8080');
      const key = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
      const session = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
      if (key && session) {
        await page.evaluate(([k, s]) => window.localStorage.setItem(k, s), [key, session]);
      }
    });

    for (const href of MOBILE_ROUTES) {
      test(`taps ${href}`, async ({ page }) => {
        await page.goto('http://localhost:8080/agenda');
        // Open drawer.
        await page.getByRole('button', { name: /menu|abrir menu/i }).click();
        const link = page.getByTestId(`sidebar-link-${href}`);
        await expect(link).toBeVisible();
        await link.tap();
        await page.waitForURL(`**${href === '/' ? '/' : href}`);
        // Drawer should close and body scroll should be unlocked.
        await expect(page.locator('aside[role="dialog"]')).toHaveAttribute('aria-hidden', 'true');
      });
    }
  });
}
