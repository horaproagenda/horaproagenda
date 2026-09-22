// Central de avisos no celular/tablet (Web Push).
//
// Modos:
//  - { event: 'appointment_new' | 'appointment_confirmed' | 'appointment_cancelled', appointment_id }
//    chamado automaticamente pela agenda (trigger no banco), em tempo real.
//  - { mode: 'reminders' }  -> varredura dos lembretes que venceram (cron).
//  - { mode: 'test' }       -> aviso de teste para o próprio usuário (precisa de sessão).
//  - { mode: 'config' }     -> devolve a chave pública usada pelo navegador.
//
// Antiduplicidade: cada aviso tem uma chave única gravada em push_notification_log;
// se a chave já existe, nada é enviado de novo.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { readVapidConfig, sendWebPush } from '../_shared/webpush.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

type PrefKey =
  | 'push_appointment_new'
  | 'push_appointment_confirmed'
  | 'push_appointment_cancelled'
  | 'push_reminders';

const EVENT_PREF: Record<string, PrefKey> = {
  appointment_new: 'push_appointment_new',
  appointment_confirmed: 'push_appointment_confirmed',
  appointment_cancelled: 'push_appointment_cancelled',
  reminder: 'push_reminders',
};

async function userAcceptsType(userId: string, prefKey: PrefKey): Promise<boolean> {
  const { data } = await admin
    .from('professional_preferences')
    .select(`push_enabled, ${prefKey}`)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return true; // sem preferência salva = tudo ligado
  const row = data as Record<string, boolean | null>;
  if (row.push_enabled === false) return false;
  return row[prefKey] !== false;
}

interface Delivery {
  userId: string;
  dedupeKey: string;
  type: string;
  title: string;
  body: string;
  url?: string;
}

/** Envia para todos os aparelhos do usuário, uma única vez por chave. */
async function deliver(item: Delivery, prefKey?: PrefKey): Promise<{ sent: number; skipped?: string }> {
  const vapid = readVapidConfig();
  if (!vapid.configured) return { sent: 0, skipped: 'vapid_not_configured' };

  if (prefKey && !(await userAcceptsType(item.userId, prefKey))) {
    return { sent: 0, skipped: 'disabled_by_user' };
  }

  // Trava de antiduplicidade: a chave única do banco garante um envio só,
  // mesmo com chamadas simultâneas de dispositivos ou triggers repetidos.
  const { error: logError } = await admin.from('push_notification_log').insert({
    user_id: item.userId,
    dedupe_key: item.dedupeKey,
    type: item.type,
    title: item.title,
    body: item.body,
  });
  if (logError) {
    if (logError.code === '23505' || /duplicate key/i.test(logError.message)) {
      return { sent: 0, skipped: 'duplicate' };
    }
    console.error('push log insert failed', logError);
    return { sent: 0, skipped: 'log_error' };
  }

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', item.userId)
    .eq('enabled', true);

  if (!subs?.length) return { sent: 0, skipped: 'no_devices' };

  let sent = 0;
  for (const sub of subs) {
    const result = await sendWebPush(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      { title: item.title, body: item.body, url: item.url, tag: item.dedupeKey, type: item.type },
      vapid,
    );
    if (result.ok) {
      sent++;
      await admin
        .from('push_subscriptions')
        .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
        .eq('id', sub.id);
    } else if (result.gone) {
      await admin.from('push_subscriptions').delete().eq('id', sub.id);
    } else {
      console.error('push send failed', result.status, result.error);
      await admin
        .from('push_subscriptions')
        .update({ failure_count: (sub as { failure_count?: number }).failure_count ?? 1 })
        .eq('id', sub.id);
    }
  }

  await admin
    .from('push_notification_log')
    .update({ delivered_count: sent })
    .eq('user_id', item.userId)
    .eq('dedupe_key', item.dedupeKey);

  return { sent };
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })} às ${
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  }`;
}

async function handleAppointmentEvent(event: string, appointmentId: string) {
  const prefKey = EVENT_PREF[event];
  if (!prefKey) return json({ error: 'evento_desconhecido' }, 400);

  const { data: appointment, error } = await admin
    .from('appointments')
    .select('id, start_time, status, professional_id, client_id, service_id, updated_at')
    .eq('id', appointmentId)
    .maybeSingle();
  if (error || !appointment) return json({ skipped: 'appointment_not_found' });

  if (!appointment.professional_id) return json({ skipped: 'no_professional' });

  const [{ data: professional }, { data: client }, { data: service }] = await Promise.all([
    admin.from('professionals').select('id, user_id, name').eq('id', appointment.professional_id).maybeSingle(),
    appointment.client_id
      ? admin.from('clients').select('name').eq('id', appointment.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    appointment.service_id
      ? admin.from('services').select('name').eq('id', appointment.service_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!professional?.user_id) return json({ skipped: 'professional_without_login' });

  const when = fmtDateTime(appointment.start_time);
  const clientName = (client as { name?: string } | null)?.name || 'Cliente';
  const serviceName = (service as { name?: string } | null)?.name || 'Atendimento';

  const titles: Record<string, string> = {
    appointment_new: 'Novo agendamento',
    appointment_confirmed: 'Agendamento confirmado',
    appointment_cancelled: 'Agendamento cancelado',
  };

  const result = await deliver({
    userId: professional.user_id,
    dedupeKey: `${event}:${appointment.id}`,
    type: event,
    title: titles[event],
    body: `${clientName} — ${serviceName}, ${when}`,
    url: '/agenda',
  }, prefKey);

  return json({ event, ...result });
}

async function handleReminders() {
  const now = new Date();
  const spNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const today = `${spNow.getFullYear()}-${String(spNow.getMonth() + 1).padStart(2, '0')}-${String(spNow.getDate()).padStart(2, '0')}`;
  const minutesNow = spNow.getHours() * 60 + spNow.getMinutes();

  const { data: reminders } = await admin
    .from('reminders')
    .select('id, title, description, reminder_date, reminder_time, created_by, is_active, is_completed')
    .eq('reminder_date', today)
    .eq('is_active', true)
    .eq('is_completed', false);

  let sent = 0;
  let considered = 0;
  for (const reminder of reminders ?? []) {
    if (!reminder.reminder_time || !reminder.created_by) continue;
    const [h, m] = String(reminder.reminder_time).slice(0, 5).split(':').map(Number);
    const minutes = (h || 0) * 60 + (m || 0);
    // janela de 10 minutos: pega o horário exato mesmo com atraso do agendador
    if (minutes > minutesNow || minutesNow - minutes > 10) continue;
    considered++;
    const result = await deliver({
      userId: reminder.created_by,
      dedupeKey: `reminder:${reminder.id}:${today}`,
      type: 'reminder',
      title: `Lembrete: ${reminder.title}`,
      body: reminder.description || `Compromisso das ${String(reminder.reminder_time).slice(0, 5)}`,
      url: '/lembretes',
    }, 'push_reminders');
    sent += result.sent;
  }

  return json({ mode: 'reminders', considered, sent });
}

async function handleTest(authHeader: string | null) {
  if (!authHeader) return json({ error: 'sem_sessao' }, 401);
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'sem_sessao' }, 401);

  const result = await deliver({
    userId: user.id,
    dedupeKey: `test:${Date.now()}`,
    type: 'test',
    title: 'Avisos ativados',
    body: 'É assim que os avisos do Hora Pro vão aparecer no seu aparelho.',
    url: '/agenda',
  });
  return json({ mode: 'test', ...result });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const mode = body?.mode || (body?.event ? 'event' : 'config');

    if (mode === 'config') {
      const vapid = readVapidConfig();
      return json({ publicKey: vapid.publicKey, configured: vapid.configured });
    }

    if (mode === 'event') {
      if (!body?.appointment_id) return json({ error: 'appointment_id_obrigatorio' }, 400);
      return await handleAppointmentEvent(String(body.event), String(body.appointment_id));
    }

    if (mode === 'reminders') {
      const accepted = [Deno.env.get('PUSH_CRON_SECRET'), Deno.env.get('CRON_SECRET')].filter(Boolean);
      const provided = req.headers.get('x-cron-secret');
      if (accepted.length && !accepted.includes(provided || '')) return json({ error: 'nao_autorizado' }, 401);
      return await handleReminders();
    }

    if (mode === 'test') {
      return await handleTest(req.headers.get('Authorization'));
    }

    return json({ error: 'modo_invalido' }, 400);
  } catch (err) {
    console.error('push-dispatch error', err);
    return json({ error: 'falha_inesperada' }, 500);
  }
});
