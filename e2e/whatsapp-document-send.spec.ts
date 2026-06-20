import { test, expect } from '@playwright/test';

const appUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';

test('enviar documento envia pela instância WhatsApp conectada e registra a rota usada', async ({ page, context }) => {
  const blockedRedirectRoutes: string[] = [];
  let sentBody: any = null;
  await context.route('https://wa.me/**', route => {
    blockedRedirectRoutes.push(route.request().url());
    return route.abort();
  });
  await context.route('https://api.whatsapp.com/**', route => {
    blockedRedirectRoutes.push(route.request().url());
    return route.abort();
  });
  await context.route('https://web.whatsapp.com/**', route => {
    blockedRedirectRoutes.push(route.request().url());
    return route.abort();
  });
  await context.route('**/functions/v1/whatsapp-send', async route => {
    sentBody = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, provider: 'evolution', route: 'evolution-api', instance: 'default' }),
    });
  });

  await page.route(`${appUrl}/whatsapp-e2e`, route => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: `
      <button type="button" aria-label="Enviar documento">Enviar documento</button>
      <script>
      const documentMessage = [
        '📄 *Termo de Consentimento*',
        'Contrato',
        '',
        '⚠️ Aguardando assinatura',
        '',
        '---',
        'Autorizo o procedimento estético facial.',
        '---',
        '',
        'Documento gerado em 01/06/2026 às 10:00'
      ].join('\\n');

      document.querySelector('button').addEventListener('click', async () => {
        const response = await fetch('https://nsgcllrbswodjoadybsj.supabase.co/functions/v1/whatsapp-send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
          body: JSON.stringify({ phone: '(11) 98765-4321', client_id: 'client-1', message: documentMessage })
        });
        window.__whatsappSendResult = await response.json();
        sessionStorage.setItem('horapro:last-whatsapp-route', JSON.stringify({ route: window.__whatsappSendResult.route, status: 'sent', instance: window.__whatsappSendResult.instance }));
      });
      </script>
    `,
  }));
  await page.goto(`${appUrl}/whatsapp-e2e`, { waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: /enviar documento/i }).click();
  await expect.poll(() => sentBody?.message || '').toContain('Termo de Consentimento');
  const message = sentBody.message;

  expect(sentBody.phone).toBe('(11) 98765-4321');
  expect(sentBody.client_id).toBe('client-1');
  expect(message).toContain('📄 *Termo de Consentimento*');
  expect(message).toContain('Contrato');
  expect(message).toContain('⚠️ Aguardando assinatura');
  expect(message).toContain('Autorizo o procedimento estético facial.');
  expect(message).toContain('Documento gerado em 01/06/2026 às 10:00');

  const result = await page.evaluate(() => (window as any).__whatsappSendResult);
  expect(result.route).toBe('evolution-api');
  expect(result.provider).toBe('evolution');

  const routeLog = await page.evaluate(() => sessionStorage.getItem('horapro:last-whatsapp-route'));
  expect(routeLog).toContain('evolution-api');
  expect(routeLog).toContain('sent');
  expect(routeLog).not.toContain('api.whatsapp.com');
  expect(blockedRedirectRoutes).toEqual([]);
});