import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TWILIO_GATEWAY = 'https://connector-gateway.lovable.dev/twilio';

function cleanPhoneBR(raw: string): string {
  let p = raw.replace(/\D/g, '');
  if (p.startsWith('0')) p = p.substring(1);
  if (!p.startsWith('55')) p = '55' + p;
  return p;
}

function buildMessage(client: string, service: string, when: Date, hours: number) {
  const data = when.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
  const hora = when.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  const quando = hours >= 24 ? `amanhã (${data})` : `daqui a aproximadamente ${hours}h`;
  return `Olá ${client}! 👋\n\nLembrete do seu agendamento ${quando}:\n📅 ${service}\n⏰ ${hora}\n\nSe precisar reagendar, entre em contato. Até breve! ✨`;
}

async function sendViaEvolution(phone: string, message: string) {
  const url = (Deno.env.get('EVOLUTION_API_URL') || '').trim();
  const key = Deno.env.get('EVOLUTION_API_KEY');
  const instance = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'default';
  if (!url || !key) throw new Error('Evolution não configurado');
  const r = await fetch(`${new URL(url).origin}/message/sendText/${encodeURIComponent(instance)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key },
    body: JSON.stringify({ number: cleanPhoneBR(phone), text: message }),
  });
  if (!r.ok) throw new Error(`Evolution ${r.status}: ${await r.text()}`);
  return await r.json();
}

async function sendViaTwilio(phone: string, message: string, channel: 'sms' | 'whatsapp') {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  const twilioKey = Deno.env.get('TWILIO_API_KEY');
  const from = Deno.env.get('TWILIO_FROM_NUMBER');
  if (!lovableKey) throw new Error('LOVABLE_API_KEY ausente');
  if (!twilioKey) throw new Error('TWILIO_API_KEY ausente');
  if (!from) throw new Error('TWILIO_FROM_NUMBER ausente (configure nas Configurações)');

  const to = '+' + cleanPhoneBR(phone);
  const body = new URLSearchParams({
    To: channel === 'whatsapp' ? `whatsapp:${to}` : to,
    From: channel === 'whatsapp' ? (from.startsWith('whatsapp:') ? from : `whatsapp:${from}`) : from,
    Body: message,
  });

  const r = await fetch(`${TWILIO_GATEWAY}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      'X-Connection-Api-Key': twilioKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Twilio ${r.status}: ${JSON.stringify(data)}`);
  return data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const summary: Record<string, unknown> = { sent: 0, skipped: 0, errors: [] as string[] };

  try {
    const { data: settings, error: setErr } = await supabase
      .from('business_settings')
      .select('*')
      .limit(1)
      .single();
    if (setErr) throw setErr;
    if (!settings?.automation_whatsapp_reminders) {
      return new Response(JSON.stringify({ success: true, message: 'Lembretes desativados', summary }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const hoursList: number[] = (settings.reminder_hours_before && settings.reminder_hours_before.length > 0)
      ? settings.reminder_hours_before
      : [24, 1];
    const provider: string = settings.reminder_provider || 'whatsapp';
    if (settings.twilio_from_number) Deno.env.set('TWILIO_FROM_NUMBER', settings.twilio_from_number);

    const now = Date.now();
    // Window covers all reminder hours; we filter per-hour below
    const maxH = Math.max(...hoursList);
    const minH = Math.min(...hoursList);
    const fromIso = new Date(now + (minH - 1) * 3600 * 1000).toISOString();
    const toIso = new Date(now + (maxH + 1) * 3600 * 1000).toISOString();

    const { data: appts, error: aErr } = await supabase
      .from('appointments')
      .select('id, start_time, status, client:clients(name, phone), service:services(name)')
      .gte('start_time', fromIso)
      .lte('start_time', toIso)
      .not('status', 'in', '(cancelled,missed,rescheduled,completed)');
    if (aErr) throw aErr;

    for (const apt of appts || []) {
      const phone = (apt as any).client?.phone;
      const clientName = (apt as any).client?.name || 'cliente';
      const serviceName = (apt as any).service?.name || 'atendimento';
      if (!phone) { (summary.skipped as number)++; continue; }
      const start = new Date(apt.start_time as string).getTime();
      const hoursDiff = (start - now) / 3600000;

      for (const h of hoursList) {
        // Trigger if appointment is within [h-0.5, h] hours from now (30 min window)
        if (hoursDiff > h || hoursDiff < h - 0.5) continue;

        // Already sent?
        const { data: existing } = await supabase
          .from('appointment_reminder_log')
          .select('id')
          .eq('appointment_id', apt.id)
          .eq('hours_before', h)
          .eq('provider', provider)
          .maybeSingle();
        if (existing) continue;

        const message = buildMessage(clientName, serviceName, new Date(apt.start_time as string), h);
        try {
          let channel = 'whatsapp';
          if (provider === 'twilio_sms') { await sendViaTwilio(phone, message, 'sms'); channel = 'sms'; }
          else if (provider === 'twilio_whatsapp') { await sendViaTwilio(phone, message, 'whatsapp'); channel = 'whatsapp'; }
          else { await sendViaEvolution(phone, message); channel = 'whatsapp'; }

          await supabase.from('appointment_reminder_log').insert({
            appointment_id: apt.id, hours_before: h, provider, channel, status: 'sent',
          });
          (summary.sent as number)++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          (summary.errors as string[]).push(`${apt.id}@${h}h: ${msg}`);
          await supabase.from('appointment_reminder_log').insert({
            appointment_id: apt.id, hours_before: h, provider, channel: 'unknown', status: 'failed', error: msg,
          });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('send-appointment-reminders error:', error);
    return new Response(JSON.stringify({ success: false, error: msg, summary }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
