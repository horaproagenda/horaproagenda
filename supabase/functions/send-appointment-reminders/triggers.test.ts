/**
 * E2E test: garante que os triggers de limpeza da fila de WhatsApp
 * se comportam corretamente quando um agendamento é:
 *   1. Excluído              → linha pendente na fila é removida.
 *   2. Cancelado (status)    → linha pendente vira "cancelled".
 *   3. Tem o horário editado → linha pendente é removida e log limpo,
 *                              para que o próximo ciclo do cron gere
 *                              o lembrete já com o novo horário.
 *
 * Usa SUPABASE_SERVICE_ROLE_KEY para bypassar RLS e manipular dados
 * de teste diretamente. Cria seus próprios cliente + agendamento
 * descartáveis e limpa tudo ao final.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL") ?? "";
const SERVICE_ROLE =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";

if (skip) {
  console.warn(
    "[triggers.test] SUPABASE_URL/SERVICE_ROLE_KEY ausentes; testes serão pulados.",
  );
}

const admin = skip
  ? (null as unknown as ReturnType<typeof createClient>)
  : createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

async function pickProfessional(): Promise<string> {
  const { data, error } = await admin
    .from("professionals")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  assert(data?.id, "Nenhum profissional disponível para o teste");
  return data!.id as string;
}

async function createTempClient(professional_id: string): Promise<string> {
  const tag = `e2e-reminder-${crypto.randomUUID().slice(0, 8)}`;
  const { data, error } = await admin
    .from("clients")
    .insert({
      name: `E2E Reminder ${tag}`,
      phone: "5511900000000",
      professional_id,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function createAppointment(
  client_id: string,
  professional_id: string,
  startIso: string,
  endIso: string,
): Promise<string> {
  const { data, error } = await admin
    .from("appointments")
    .insert({
      client_id,
      professional_id,
      start_time: startIso,
      end_time: endIso,
      status: "scheduled",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function enqueueFakeReminder(opts: {
  appointment_id: string;
  professional_id: string;
  body: string;
}) {
  const dedup = `e2e-${opts.appointment_id}`;
  const { error } = await admin.from("whatsapp_send_queue").insert({
    to_phone: "5511900000000",
    body: opts.body,
    appointment_id: opts.appointment_id,
    professional_id: opts.professional_id,
    template_type: "reminder",
    hours_before: 24,
    provider: "whatsapp",
    dedup_key: dedup,
    status: "pending",
    next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
  });
  if (error) throw error;
  return dedup;
}

async function getQueueRow(appointment_id: string) {
  const { data } = await admin
    .from("whatsapp_send_queue")
    .select("id, status, body")
    .eq("appointment_id", appointment_id)
    .maybeSingle();
  return data;
}

async function cleanup(ids: { client?: string; appointment?: string }) {
  if (ids.appointment) {
    await admin.from("whatsapp_send_queue").delete().eq("appointment_id", ids.appointment);
    await admin.from("appointment_reminder_log").delete().eq("appointment_id", ids.appointment);
    await admin.from("appointments").delete().eq("id", ids.appointment);
  }
  if (ids.client) await admin.from("clients").delete().eq("id", ids.client);
}


Deno.test({
  name: "DELETE agendamento → remove lembrete pendente da fila",
  ignore: skip,
  async fn() {
    const prof = await pickProfessional();
    const client = await createTempClient(prof);
    const start = new Date(Date.now() + 24 * 3600_000).toISOString();
    const end = new Date(Date.now() + 25 * 3600_000).toISOString();
    const appt = await createAppointment(client, prof, start, end);
    try {
      await enqueueFakeReminder({
        appointment_id: appt,
        professional_id: prof,
        body: "Lembrete original",
      });
      assert((await getQueueRow(appt)) !== null, "fila deveria ter linha pendente");

      // Exclui o agendamento
      const { error } = await admin.from("appointments").delete().eq("id", appt);
      assertEquals(error, null);

      const after = await getQueueRow(appt);
      assertEquals(after, null, "linha da fila deveria ter sido apagada pelo trigger");
    } finally {
      await cleanup({ client }); // appointment já foi deletado
    }
  },
});

Deno.test({
  name: "Cancelar agendamento (status) → marca lembrete pendente como cancelled",
  ignore: skip,
  async fn() {
    const prof = await pickProfessional();
    const client = await createTempClient(prof);
    const start = new Date(Date.now() + 24 * 3600_000).toISOString();
    const end = new Date(Date.now() + 25 * 3600_000).toISOString();
    const appt = await createAppointment(client, prof, start, end);
    try {
      await enqueueFakeReminder({
        appointment_id: appt,
        professional_id: prof,
        body: "Lembrete original",
      });

      const { error } = await admin
        .from("appointments")
        .update({ status: "cancelled" })
        .eq("id", appt);
      assertEquals(error, null);

      const after = await getQueueRow(appt);
      assert(after, "linha da fila deveria existir");
      assertEquals(after!.status, "cancelled");
    } finally {
      await cleanup({ client, appointment: appt });
    }
  },
});

Deno.test({
  name: "Editar horário → apaga lembrete antigo e zera log (próximo cron gera novo)",
  ignore: skip,
  async fn() {
    const prof = await pickProfessional();
    const client = await createTempClient(prof);
    const start = new Date(Date.now() + 24 * 3600_000).toISOString();
    const end = new Date(Date.now() + 25 * 3600_000).toISOString();
    const appt = await createAppointment(client, prof, start, end);
    try {
      await enqueueFakeReminder({
        appointment_id: appt,
        professional_id: prof,
        body: "Lembrete com horário ANTIGO",
      });
      // Simula log de envio anterior — deve ser apagado também
      await admin.from("appointment_reminder_log").insert({
        appointment_id: appt,
        hours_before: 24,
        provider: "whatsapp",
        channel: "whatsapp",
        status: "sent",
      });

      const newStart = new Date(Date.now() + 48 * 3600_000).toISOString();
      const newEnd = new Date(Date.now() + 49 * 3600_000).toISOString();
      const { error } = await admin
        .from("appointments")
        .update({ start_time: newStart, end_time: newEnd })
        .eq("id", appt);
      assertEquals(error, null);

      const queue = await getQueueRow(appt);
      assertEquals(queue, null, "linha pendente desatualizada deveria ter sido apagada");

      const { data: log } = await admin
        .from("appointment_reminder_log")
        .select("id")
        .eq("appointment_id", appt);
      assertEquals(log?.length ?? 0, 0, "log antigo deveria ter sido limpo para regenerar");
    } finally {
      await cleanup({ client, appointment: appt });
    }
  },
});
