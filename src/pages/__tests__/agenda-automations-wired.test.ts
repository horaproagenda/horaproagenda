/**
 * Regression guard: ensures the Agenda page exposes the automation features
 * (waiting list, fit-in/gap finder, occupancy, smart recurrence) on every
 * viewport, and that the per-appointment WhatsApp reminder button (with
 * editable preview) stays wired in the appointment detail dialog.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

describe('Agenda automations + per-appointment WhatsApp reminder wiring', () => {
  const agenda = read('src/pages/Agenda.tsx');
  const mobileHeader = read('src/components/agenda/MobileAgendaHeader.tsx');
  const automationPanel = read('src/components/agenda/AgendaAutomationPanel.tsx');
  const detailDialog = read('src/components/appointments/AppointmentDetailDialog.tsx');

  it('imports the automation panel into the Agenda page', () => {
    expect(agenda).toMatch(/AgendaAutomationPanel/);
  });

  it('exposes a sheet to open automations on every viewport', () => {
    expect(agenda).toMatch(/showAutomationsSheet/);
    expect(agenda).toMatch(/setShowAutomationsSheet\(true\)/);
    expect(agenda).toMatch(/forceExpanded/);
  });

  it('automation panel supports forceExpanded for sheet embedding', () => {
    expect(automationPanel).toMatch(/forceExpanded\?: boolean/);
  });

  it('exposes Automations entry in the mobile header dropdown', () => {
    expect(agenda).toMatch(/onOpenAutomations=\{\(\) => setShowAutomationsSheet\(true\)\}/);
    expect(mobileHeader).toMatch(/onOpenAutomations\?:/);
  });

  it('does NOT expose a global "send WhatsApp reminders" trigger on the Agenda toolbar', () => {
    expect(agenda).not.toMatch(/handleSendWhatsappReminders/);
    expect(agenda).not.toMatch(/send-appointment-reminders/);
    expect(mobileHeader).not.toMatch(/onSendWhatsappReminders/);
  });

  it('keeps the per-appointment WhatsApp reminder button with editable preview', () => {
    // Button label visible in the detail header
    expect(detailDialog).toMatch(/Enviar lembrete no WhatsApp/);
    // Editable preview dialog is wired with the reminder message
    expect(detailDialog).toMatch(/whatsappPreviewOpen/);
    expect(detailDialog).toMatch(/initialMessage=\{whatsappPreviewMessage\}/);
  });
});
