import { describe, expect, it } from 'vitest';
import { decideReplyAction } from '../../../supabase/functions/_shared/whatsappIntent';

const NOW = new Date('2026-08-17T18:00:00Z').getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

const appt = (over: Partial<Parameters<typeof decideReplyAction>[0]['candidates'][number]> = {}) => ({
  id: 'a1',
  status: 'scheduled',
  start_time: new Date(NOW + 86400_000).toISOString(),
  confirmation_token: 'tok',
  invited_at: hoursAgo(2),
  ...over,
});

describe('decideReplyAction', () => {
  it('pergunta quando há confirmação pendente recente', () => {
    expect(decideReplyAction({ intent: null, candidates: [appt()], now: NOW }))
      .toEqual({ action: 'ask_clarification', appointmentId: 'a1' });
  });

  it('não repete a pergunta para o mesmo horário', () => {
    expect(decideReplyAction({ intent: null, candidates: [appt()], alreadyClarifiedIds: ['a1'], now: NOW }))
      .toEqual({ action: 'silent', reason: 'intent_unclear_silenced' });
  });

  it('não pergunta quando o horário já está confirmado', () => {
    expect(decideReplyAction({ intent: null, candidates: [appt({ status: 'confirmed' })], now: NOW }))
      .toEqual({ action: 'silent', reason: 'settled' });
  });

  it('não pergunta quando não há horário pendente (cancelado some da lista)', () => {
    expect(decideReplyAction({ intent: null, candidates: [], now: NOW }))
      .toEqual({ action: 'silent', reason: 'no_pending_confirmation' });
  });

  it('não pergunta fora da janela de 12h do convite', () => {
    expect(decideReplyAction({ intent: null, candidates: [appt({ invited_at: hoursAgo(30) })], now: NOW }))
      .toEqual({ action: 'silent', reason: 'settled' });
  });

  it('aplica intenção explícita em horário pendente', () => {
    expect(decideReplyAction({ intent: 'confirm', candidates: [appt()], now: NOW }))
      .toEqual({ action: 'apply_intent', appointmentId: 'a1' });
    expect(decideReplyAction({ intent: 'cancel', candidates: [appt()], now: NOW }))
      .toEqual({ action: 'apply_intent', appointmentId: 'a1' });
  });

  it('avisa quando o cliente confirma um horário já confirmado', () => {
    expect(decideReplyAction({ intent: 'confirm', candidates: [appt({ status: 'confirmed' })], now: NOW }))
      .toEqual({ action: 'already_confirmed', appointmentId: 'a1' });
  });

  it('permite cancelar um horário confirmado', () => {
    expect(decideReplyAction({ intent: 'cancel', candidates: [appt({ status: 'confirmed' })], now: NOW }))
      .toEqual({ action: 'apply_intent', appointmentId: 'a1' });
  });

  it('ignora mensagens sem convite algum', () => {
    expect(decideReplyAction({ intent: 'confirm', candidates: [appt({ invited_at: null })], now: NOW }))
      .toEqual({ action: 'silent', reason: 'no_pending_confirmation' });
  });
});
