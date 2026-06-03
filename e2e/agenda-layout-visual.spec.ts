import { expect, test } from '@playwright/test';

const appUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';
const PROJECT_REF = 'nsgcllrbswodjoadybsj';
const authStorageKey = `sb-${PROJECT_REF}-auth-token`;

async function mockAgendaData(page: import('@playwright/test').Page) {
  await page.addInitScript(({ key }) => {
    const token = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' })) + '.' + btoa(JSON.stringify({ sub: 'visual-user', exp: Math.floor(Date.now() / 1000) + 3600 })) + '.signature';
    localStorage.setItem(key, JSON.stringify({
      access_token: token,
      refresh_token: 'visual-refresh-token',
      token_type: 'bearer',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: 'visual-user',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'visual@agendalume.test',
        email_confirmed_at: new Date().toISOString(),
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
      },
    }));
    localStorage.setItem('agenda-view-type', 'week');
    localStorage.setItem('sidebar-collapsed', 'true');
    document.documentElement.classList.add('fonts-ready', 'no-animations');
  }, { key: authStorageKey });

  await page.route('**/auth/v1/user**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ id: 'visual-user', email: 'visual@agendalume.test', email_confirmed_at: new Date().toISOString() }),
  }));

  await page.route('**/rest/v1/rpc/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/realtime/v1/**', route => route.abort());

  await page.route('**/rest/v1/**', route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const wantsObject = route.request().headers().accept?.includes('vnd.pgrst.object+json');

    const rows: Record<string, unknown> = {
      profiles: { id: 'visual-user', full_name: 'Administrador', email: 'visual@agendalume.test' },
      user_roles: [{ role: 'admin' }],
      professionals: [
        { id: 'prof-1', name: 'Flávia Maria', agenda_color: '#a16207', is_active: true },
        { id: 'prof-2', name: 'Lívia Santana', agenda_color: '#0f766e', is_active: true },
      ],
      rooms: [{ id: 'room-1', name: 'Sala 1', is_active: true }],
      equipment: [],
      professional_absences: [],
      card_brands: [],
      business_settings: {
        id: 'settings-1', opening_time: '08:00:00', closing_time: '20:00:00', slot_interval: 30,
        work_saturdays: true, work_sundays: false, saturday_opening_time: '08:00:00', saturday_closing_time: '18:00:00',
        sunday_opening_time: '08:00:00', sunday_closing_time: '18:00:00', drag_and_drop_enabled: true,
        auto_complete_appointments: false, timezone: 'America/Sao_Paulo', overdue_days_threshold: 7,
        automation_whatsapp_reminders: false, automation_waitlist: false, automation_gap_finder: false,
        automation_occupancy_dashboard: false, automation_smart_recurrence: false, reminder_hours_before: [24, 1],
        reminder_provider: 'whatsapp', clinic_name: 'Lume Agenda', clinic_phone: null, clinic_address: null,
        clinic_email: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      },
      appointments: [
        {
          id: 'apt-1', client_id: 'client-1', professional_id: 'prof-1', service_id: 'service-1', room_id: 'room-1',
          start_time: '2026-06-06T10:00:00.000Z', end_time: '2026-06-06T11:00:00.000Z', status: 'scheduled', payment_status: 'pending',
          client: { id: 'client-1', name: 'Flávia Maria Duque', phone: '(11) 99999-0000', email: null, credit_balance: 0 },
          service: { id: 'service-1', name: 'Limpeza de pele', price: 180, duration: 60, category: 'estética', room: { id: 'room-1', name: 'Sala 1' }, professional: { id: 'prof-1', name: 'Flávia Maria' } },
          room: { id: 'room-1', name: 'Sala 1' }, package_appointment: null, additional_items: [],
        },
      ],
    };

    const table = Object.keys(rows).find(name => path.includes(`/rest/v1/${name}`));
    const body = table ? (wantsObject && Array.isArray(rows[table]) ? (rows[table] as unknown[])[0] : rows[table]) : [];
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test('Agenda não exibe faixa branca bloqueante em viewport de notebook', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await mockAgendaData(page);
  await page.goto(`${appUrl}/agenda`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible();

  const main = page.getByTestId('app-main-scroll');
  await expect(main).toBeVisible();
  await expect.poll(async () => main.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);

  const blockingWhiteBand = await page.evaluate(() => {
    const el = document.elementFromPoint(Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight * 0.72));
    const style = el ? getComputedStyle(el) : null;
    return Boolean(style && style.backgroundColor === 'rgb(255, 255, 255)' && style.pointerEvents !== 'none');
  });
  expect(blockingWhiteBand).toBe(false);
  await expect(page).toHaveScreenshot('agenda-notebook-no-white-bar.png', { maxDiffPixelRatio: 0.03 });
});