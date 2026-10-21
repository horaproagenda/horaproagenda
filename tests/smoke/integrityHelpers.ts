import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export function packageTemplateFixture(name: string, professionalId: string) {
  if (!professionalId.trim()) throw new Error('O modelo de teste exige um profissional responsável.');
  return { name, professional_id: professionalId, total_sessions: 1, price: 100 };
}

export function missingAppointmentSnapshots(
  rows: Array<{ id: string; service_name_snapshot?: string | null }>,
) {
  // Campo omitido não pode fazer a verificação passar silenciosamente.
  return rows
    .map((row) => ({ id: row.id, service_name_snapshot: row.service_name_snapshot ?? null }))
    .filter((row) => !row.service_name_snapshot?.trim());
}

/** Assina antes da escrita e aceita somente o INSERT com o ID esperado. */
export async function listenForAppointmentInsert(
  client: SupabaseClient,
  appointmentId: string,
  timeoutMs = 15000,
) {
  let channel: RealtimeChannel | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resolveEvent: (id: string) => void = () => undefined;
  let rejectEvent: (error: Error) => void = () => undefined;
  const received = new Promise<string>((resolve, reject) => {
    resolveEvent = resolve;
    rejectEvent = reject;
  });
  // Pode falhar durante a escrita, antes de o chamador aguardar received.
  void received.catch(() => undefined);
  const dispose = async () => {
    clearTimeout(timer);
    if (channel) await client.removeChannel(channel);
  };

  channel = client.channel(`smoke-insert-${appointmentId}`).on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'appointments', filter: `id=eq.${appointmentId}` },
    (payload) => {
      if (payload.new.id !== appointmentId) return;
      clearTimeout(timer);
      resolveEvent(appointmentId);
    },
  );

  try {
    await new Promise<void>((resolve, reject) => {
      const subscribeTimer = setTimeout(() => reject(new Error('Realtime: assinatura não confirmada.')), timeoutMs);
      channel?.subscribe((status, error) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(subscribeTimer);
          clearTimeout(timer);
          timer = setTimeout(() => rejectEvent(new Error('Realtime: INSERT não recebido.')), timeoutMs);
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          clearTimeout(subscribeTimer);
          clearTimeout(timer);
          const failure = new Error(`Realtime: ${status}${error ? ` (${error.message})` : ''}`);
          reject(failure);
          rejectEvent(failure);
        }
      });
    });
    return { received, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}