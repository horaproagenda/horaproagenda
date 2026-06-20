/**
 * Regression guard: ensures the Agenda page exposes the automation features
 * (waiting list, fit-in/gap finder, occupancy, smart recurrence) and the
 * WhatsApp reminders trigger across all viewports (mobile, tablet, desktop).
 *
 * Wiring this through static checks prevents a regression where the side panel
 * is again hidden behind `lg:` breakpoints with no mobile/tablet entry point.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

describe('Agenda automations wiring', () => {
  const agenda = read('src/pages/Agenda.tsx');
  const mobileHeader = read('src/components/agenda/MobileAgendaHeader.tsx');
  const automationPanel = read('src/components/agenda/AgendaAutomationPanel.tsx');

  it('imports the automation panel and supabase client', () => {
    expect(agenda).toMatch(/AgendaAutomationPanel/);
    expect(agenda).toMatch(/from ['"]@\/integrations\/supabase\/client['"]/);
  });

  it('exposes a sheet to open automations on every viewport', () => {
    expect(agenda).toMatch(/showAutomationsSheet/);
    expect(agenda).toMatch(/setShowAutomationsSheet\(true\)/);
    expect(agenda).toMatch(/forceExpanded/);
  });

  it('exposes a manual WhatsApp reminders trigger', () => {
    expect(agenda).toMatch(/handleSendWhatsappReminders/);
    expect(agenda).toMatch(/send-appointment-reminders/);
  });

  it('wires automations + reminders into the mobile header dropdown', () => {
    expect(agenda).toMatch(/onOpenAutomations=\{\(\) => setShowAutomationsSheet\(true\)\}/);
    expect(agenda).toMatch(/onSendWhatsappReminders=\{handleSendWhatsappReminders\}/);
    expect(mobileHeader).toMatch(/onOpenAutomations\?:/);
    expect(mobileHeader).toMatch(/onSendWhatsappReminders\?:/);
  });

  it('automation panel supports forceExpanded for sheet embedding', () => {
    expect(automationPanel).toMatch(/forceExpanded\?: boolean/);
    expect(automationPanel).toMatch(/forceExpanded \? "w-full h-full"/);
  });
});
