import { test, expect } from '@playwright/test';

const appUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';

test('enviar documento abre WhatsApp Web com mensagem esperada e registra a rota usada', async ({ page, context }) => {
  await context.route('https://wa.me/**', route => route.fulfill({ status: 200, body: 'wa.me intercepted' }));
  await context.route('https://web.whatsapp.com/**', route => route.fulfill({ status: 200, body: 'web.whatsapp intercepted' }));

  await page.route(`${appUrl}/whatsapp-e2e`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `
      <button type="button" aria-label="Enviar documento">Enviar documento</button>
      <script type="module">
      import { openWhatsappWithMessage } from '/src/lib/whatsappLink.ts';

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
      ].join('\n');

      document.querySelector('button').addEventListener('click', () => {
        window.__whatsappOpenResult = openWhatsappWithMessage('(11) 98765-4321', documentMessage);
      });
      </script>
    `,
  }));
  await page.goto(`${appUrl}/whatsapp-e2e`, { waitUntil: 'domcontentloaded' });

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: /enviar documento/i }).click();
  const popup = await popupPromise;

  await expect.poll(() => popup.url()).toContain('https://web.whatsapp.com/send');
  const finalUrl = new URL(popup.url());
  const message = finalUrl.searchParams.get('text') || '';

  expect(finalUrl.hostname).toBe('web.whatsapp.com');
  expect(finalUrl.pathname).toBe('/send');
  expect(finalUrl.searchParams.get('phone')).toBe('5511987654321');
  expect(message).toContain('📄 *Termo de Consentimento*');
  expect(message).toContain('Contrato');
  expect(message).toContain('⚠️ Aguardando assinatura');
  expect(message).toContain('Autorizo o procedimento estético facial.');
  expect(message).toContain('Documento gerado em 01/06/2026 às 10:00');

  const result = await page.evaluate(() => (window as any).__whatsappOpenResult);
  expect(result.route).toBe('web.whatsapp.com/send');
  expect(result.url).toContain('https://web.whatsapp.com/send?phone=5511987654321&text=');

  const routeLog = await page.evaluate(() => sessionStorage.getItem('agendalume:last-whatsapp-route'));
  expect(routeLog).toContain('web.whatsapp.com/send');
  expect(routeLog).toContain('opened');
  expect(routeLog).not.toContain('api.whatsapp.com');
});