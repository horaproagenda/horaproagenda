import { expect, test, type Page } from '@playwright/test';

const base = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';

// Run the real UI and global CSS with isolated providers, never a real session.
async function openIsolated(page: Page, mode: 'application' | 'payables', count = 45) {
  const modules: Record<string, string> = {
    '/src/contexts/AuthContext.tsx': "export const useAuth=()=>({hasRole:r=>r==='admin'});",
    '/src/hooks/useCurrentProfessional.ts': 'export const useCurrentProfessional=()=>({professionalId:null});',
    '/src/hooks/useProfessionals.ts': 'export const useProfessionals=()=>({professionals:[]});',
    '/src/hooks/useFinancialEntries.ts': `export const useFinancialEntries=()=>({payables:Array.from({length:${count}},(_,i)=>({id:String(i),description:i===0?'Aluguel (3/8)':'Conta de teste '+(i+1),amount:1200,due_date:new Date().toISOString().slice(0,7)+'-15',status:'pending',type:'expense'})),createEntry:{},updateEntry:{},deleteEntry:{}});`,
    '/src/hooks/useFinancialCategories.ts': 'export const useFinancialCategories=()=>({expenseCategories:[]});',
    '/src/hooks/usePaymentMethods.ts': 'export const usePaymentMethods=()=>({activePaymentMethods:[]});',
    '/src/hooks/useBanks.ts': 'export const useBanks=()=>({activeBanks:[]});',
    '/src/hooks/useReminders.ts': 'export const useReminders=()=>({createReminder:{}});',
    '/src/hooks/useBusinessSettings.ts': 'export const useBusinessSettings=()=>({settings:{}});',
    '/src/hooks/useActionGuard.ts': 'export const useActionGuard=()=>({run:async f=>f(),isPending:false});',
    '/src/integrations/supabase/client.ts': 'export const supabase={rpc:async()=>({data:{ok:true},error:null})};',
    '/__layout_query.js': 'export const useQueryClient=()=>({invalidateQueries:async()=>{}});export const useQuery=()=>({data:[],isLoading:false});',
  };
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) { await route.abort(); return; }
    const path = url.pathname;
    if (path === '/__layout_test') {
      await route.fulfill({ contentType: 'text/html', body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/index.css"></head><body><div id="root"></div><script type="module">
        import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;
        import React from '/node_modules/.vite/deps/react.js'; import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
        const {ClientApplicationsTab}=await import('/src/components/client-profile/ClientApplicationsTab.tsx');
        const {ContasAPagar}=await import('/src/components/financeiro/ContasAPagar.tsx');
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement('div',{style:{padding:16}},${mode === 'application' ? "React.createElement(ClientApplicationsTab,{clientId:'test',clientName:'Teste isolado'})" : 'React.createElement(ContasAPagar)'}));
        </script></body></html>` });
    } else if (modules[path]) {
      await route.fulfill({ contentType: 'application/javascript', body: modules[path] });
    } else if (path === '/src/components/client-profile/ClientApplicationsTab.tsx' || path === '/src/components/financeiro/ContasAPagar.tsx') {
      const response = await route.fetch();
      const body = (await response.text()).replace(/"\/node_modules\/\.vite\/deps\/@tanstack_react-query\.js[^\"]*"/g, '"/__layout_query.js"');
      await route.fulfill({ response, body });
    } else { await route.continue(); }
  });
  await page.goto(`${base}/__layout_test?mode=${mode}`, { waitUntil: 'networkidle' });
}

for (const width of [390, 412]) {
  test(`ficha: último campo e salvar alcançáveis em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openIsolated(page, 'application');
    await page.getByRole('button', { name: 'Nova ficha', exact: true }).click();
    const editor = page.getByRole('dialog');
    const fields = page.locator('[data-application-fields]');
    const procedure = editor.locator('input').nth(1);
    await procedure.fill('Laser de teste');
    const lastField = fields.locator('input').last();
    await lastField.fill('2026-11-15');
    await fields.evaluate(e => { e.scrollTop = e.scrollHeight; });
    await expect.poll(async () => {
      const field = await lastField.boundingBox();
      const area = await fields.boundingBox();
      return !!field && !!area && field.y >= area.y && field.y + field.height <= area.y + area.height + 1;
    }).toBe(true);
    for (const height of [480, 844]) {
      await page.setViewportSize({ width, height });
      const save = page.getByRole('button', { name: 'Salvar rascunho', exact: true });
      await expect.poll(async () => {
        const rect = await save.boundingBox();
        return !!rect && rect.y >= 0 && rect.y + rect.height <= height + 1;
      }).toBe(true);
    }
    await expect(procedure).toHaveValue('Laser de teste');
    await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
    await expect(editor).toHaveCount(0);
  });
}

for (const count of [2, 45]) {
  test(`A Pagar: estabilidade e botões inteiros com ${count} contas`, async ({ page }) => {
    await openIsolated(page, 'payables', count);
    for (const width of [1366, 1024, 935]) {
      await page.setViewportSize({ width, height: 768 });
      const table = page.getByRole('table');
      await expect(table).toBeVisible();
      await page.waitForTimeout(200);
      const measurements = await table.evaluate(async e => {
        const widths: number[] = [];
        for (let i = 0; i < 20; i++) {
          widths.push(e.getBoundingClientRect().width);
          await new Promise(r => requestAnimationFrame(r));
        }
        return { variation: Math.max(...widths) - Math.min(...widths), overflow: e.scrollWidth - e.parentElement.clientWidth };
      });
      expect(measurements.variation).toBeLessThanOrEqual(1);
      expect(measurements.overflow).toBeLessThanOrEqual(1);
      const pay = table.getByRole('button', { name: 'Dar Baixa', exact: true }).first();
      expect(await pay.evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    }
    await page.getByRole('button', { name: 'Baixa em Lote', exact: true }).click();
    await expect(page.getByRole('table').getByRole('checkbox').first()).toBeVisible();
  });
}