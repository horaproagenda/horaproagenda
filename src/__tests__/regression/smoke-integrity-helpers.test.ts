import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listenForAppointmentInsert, missingAppointmentSnapshots, packageTemplateFixture } from '../../../tests/smoke/integrityHelpers';

describe('Smoke integrity helpers', () => {
  it('atribui o profissional responsável e rejeita modelo sem profissional', () => {
    expect(packageTemplateFixture('Pacote teste', 'prof-123').professional_id).toBe('prof-123');
    expect(() => packageTemplateFixture('Pacote teste', '')).toThrow();
  });

  it('normaliza campo omitido para null sem esconder falhas de integridade', () => {
    expect(missingAppointmentSnapshots([
      { id: 'omitido' }, { id: 'nulo', service_name_snapshot: null },
      { id: 'vazio', service_name_snapshot: ' ' }, { id: 'valido', service_name_snapshot: 'Aplicação' },
    ])).toEqual([
      { id: 'omitido', service_name_snapshot: null },
      { id: 'nulo', service_name_snapshot: null },
      { id: 'vazio', service_name_snapshot: ' ' },
    ]);
  });

  it('aguarda assinatura e recebe somente o INSERT com o ID correto', async () => {
    let onEvent: (payload: { new: { id: string } }) => void = () => undefined;
    let onStatus: (status: string) => void = () => undefined;
    const channel = {
      on: vi.fn((_event, _filter, callback) => { onEvent = callback; return channel; }),
      subscribe: vi.fn((callback) => { onStatus = callback; return channel; }),
    };
    const removeChannel = vi.fn();
    const client = { channel: vi.fn(() => channel), removeChannel } as unknown as SupabaseClient;
    let ready = false;
    const pending = listenForAppointmentInsert(client, 'appt-123');
    void pending.then(() => { ready = true; });
    await Promise.resolve();
    expect(ready).toBe(false);
    onStatus('SUBSCRIBED');
    const subscription = await pending;
    expect(channel.on.mock.calls[0][1]).toEqual({
      event: 'INSERT', schema: 'public', table: 'appointments', filter: 'id=eq.appt-123',
    });
    let received = false;
    void subscription.received.then(() => { received = true; });
    onEvent({ new: { id: 'other' } });
    await Promise.resolve();
    expect(received).toBe(false);
    onEvent({ new: { id: 'appt-123' } });
    expect(await subscription.received).toBe('appt-123');
    await subscription.dispose();
    expect(removeChannel).toHaveBeenCalledWith(channel);
  });

  it('falha imediatamente e remove canal quando a assinatura é recusada', async () => {
    const channel = {
      on: vi.fn(() => channel),
      subscribe: vi.fn((callback) => { callback('CHANNEL_ERROR', new Error('recusada')); return channel; }),
    };
    const removeChannel = vi.fn();
    const client = { channel: vi.fn(() => channel), removeChannel } as unknown as SupabaseClient;
    await expect(listenForAppointmentInsert(client, 'appt-123')).rejects.toThrow('CHANNEL_ERROR');
    expect(removeChannel).toHaveBeenCalledWith(channel);
  });
});