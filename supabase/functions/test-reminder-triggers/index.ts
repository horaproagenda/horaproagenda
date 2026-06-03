/**
 * Edge function de TESTE: executa cenários E2E dos triggers de limpeza
 * da fila de WhatsApp ao excluir/cancelar/editar agendamentos.
 *
 * Acesso restrito: exige header `x-e2e-secret` igual a E2E_TEST_SECRET
 * OU um JWT de admin. Não expõe nada para usuários comuns.
 *
 * GET (ou POST sem body) → roda os 3 cenários e devolve um relatório:
 *   { ok: boolean, scenarios: [{name, passed, details}] }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-e2e-secret",
};

interface Result {
  name: string;
  passed: boolean;
  details: Record<string, unknown>;
  error?: string;
}

async function pickProfessional(admin: any): Promise<string> {
  const { data, error } = await admin
    .from("professionals")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Nenhum profissional cadastrado");
  return data.id as string;
}

async function setupScenario(admin: any) {
  const profId = await pickProfessional(admin);
  const tag = crypto.randomUUID().slice(0, 8);
  const { data: client, error: cErr } = await admin
    .from("clients")
    .insert({
      name: `E2E Reminder ${tag}`,
      phone: "5511900000000",
      professional_id: profId,
    })
    .select("id")
    .single();
  if (cErr) throw new Error(`client insert: ${cErr.message}`);

  const start = new Date(Date.now() + 24 * 3600_000).toISOString();
  const end = new Date(Date.now() + 25 * 3600_000).toISOString();
  const { data: appt, error: aErr } = await admin
    .from("appointments")
    .insert({
      client_id: client.id,
      professional_id: profId,
      start_time: start,
      end_time: end,
      status: "scheduled",
    })
    .select("id")
    .single();
  if (aErr) throw new Error(`appointment insert: ${aErr.message}`);

  const { error: qErr } = await admin.from("whatsapp_send_queue").insert({
    to_phone: "5511900000000",
    body: "Lembrete original (E2E)",
    appointment_id: appt.id,
    professional_id: profId,
    template_type: "reminder",
    hours_before: 24,
    provider: "whatsapp",
    dedup_key: `e2e-${appt.id}`,
    status: "pending",
    next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
  });
  if (qErr) throw new Error(`queue insert: ${qErr.message}`);

  return { profId, clientId: client.id, apptId: appt.id, start, end };
}

async function cleanup(admin: any, ids: { clientId: string; apptId?: string }) {
  if (ids.apptId) {
    await admin.from("whatsapp_send_queue").delete().eq("appointment_id", ids.apptId);
    await admin.from("appointment_reminder_log").delete().eq("appointment_id", ids.apptId);
    await admin.from("appointments").delete().eq("id", ids.apptId);
  }
  await admin.from("clients").delete().eq("id", ids.clientId);
}

async function runScenarioDelete(admin: any): Promise<Result> {
  const ctx = await setupScenario(admin);
  try {
    const { error } = await admin.from("appointments").delete().eq("id", ctx.apptId);
    if (error) throw new Error(error.message);
    const { data } = await admin
      .from("whatsapp_send_queue")
      .select("id")
      .eq("appointment_id", ctx.apptId);
    const passed = (data?.length ?? 0) === 0;
    await cleanup(admin, { clientId: ctx.clientId });
    return {
      name: "DELETE agendamento → fila esvaziada",
      passed,
      details: { remainingQueueRows: data?.length ?? 0 },
    };
  } catch (e) {
    await cleanup(admin, { clientId: ctx.clientId, apptId: ctx.apptId });
    return {
      name: "DELETE agendamento → fila esvaziada",
      passed: false,
      details: {},
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function runScenarioCancel(admin: any): Promise<Result> {
  const ctx = await setupScenario(admin);
  try {
    const { error } = await admin
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", ctx.apptId);
    if (error) throw new Error(error.message);
    const { data } = await admin
      .from("whatsapp_send_queue")
      .select("status")
      .eq("appointment_id", ctx.apptId)
      .maybeSingle();
    const passed = data?.status === "cancelled";
    await cleanup(admin, { clientId: ctx.clientId, apptId: ctx.apptId });
    return {
      name: "Cancelar status → lembrete vira cancelled",
      passed,
      details: { queueStatus: data?.status ?? null },
    };
  } catch (e) {
    await cleanup(admin, { clientId: ctx.clientId, apptId: ctx.apptId });
    return {
      name: "Cancelar status → lembrete vira cancelled",
      passed: false,
      details: {},
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function runScenarioReschedule(admin: any): Promise<Result> {
  const ctx = await setupScenario(admin);
  try {
    // Insere um log de envio anterior para validar que ele também é limpo
    await admin.from("appointment_reminder_log").insert({
      appointment_id: ctx.apptId,
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
      .eq("id", ctx.apptId);
    if (error) throw new Error(error.message);

    const { data: queue } = await admin
      .from("whatsapp_send_queue")
      .select("id")
      .eq("appointment_id", ctx.apptId);
    const { data: log } = await admin
      .from("appointment_reminder_log")
      .select("id")
      .eq("appointment_id", ctx.apptId);

    const passed = (queue?.length ?? 0) === 0 && (log?.length ?? 0) === 0;
    await cleanup(admin, { clientId: ctx.clientId, apptId: ctx.apptId });
    return {
      name: "Editar horário → fila + log limpos (gera novo no próximo cron)",
      passed,
      details: {
        remainingQueueRows: queue?.length ?? 0,
        remainingLogRows: log?.length ?? 0,
        newStart,
      },
    };
  } catch (e) {
    await cleanup(admin, { clientId: ctx.clientId, apptId: ctx.apptId });
    return {
      name: "Editar horário → fila + log limpos",
      passed: false,
      details: {},
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Autorização: header secreto OU JWT de admin
  const provided = req.headers.get("x-e2e-secret");
  const expected = Deno.env.get("E2E_TEST_SECRET");
  let authorized = !!expected && provided === expected;

  if (!authorized) {
    const auth = req.headers.get("Authorization");
    if (auth?.startsWith("Bearer ")) {
      try {
        const userClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: auth } } },
        );
        const { data: claims } = await userClient.auth.getClaims(auth.replace("Bearer ", ""));
        const uid = claims?.claims?.sub;
        if (uid) {
          const { data: roles } = await userClient
            .from("user_roles")
            .select("role")
            .eq("user_id", uid);
          if ((roles ?? []).some((r: any) => r.role === "admin")) authorized = true;
        }
      } catch (_) { /* ignore */ }
    }
  }

  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const scenarios: Result[] = [];
  scenarios.push(await runScenarioDelete(admin));
  scenarios.push(await runScenarioCancel(admin));
  scenarios.push(await runScenarioReschedule(admin));

  const ok = scenarios.every((s) => s.passed);
  return new Response(JSON.stringify({ ok, scenarios }, null, 2), {
    status: ok ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
