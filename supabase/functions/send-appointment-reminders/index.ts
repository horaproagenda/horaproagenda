import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function cleanPhoneBR(raw: string): string {
  let p = (raw || '').replace(/\D/g, '');
  if (p.startsWith('0')) p = p.substring(1);
  if (!p.startsWith('55')) p = '55' + p;
  return p;
}

function fmtDate(d: Date) {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl
    .replace(/\{\{\s*cliente\s*\}\}/g, vars.cliente || '')
    .replace(/\{\{\s*data\s*\}\}/g, vars.data || '')
    .replace(/\{\{\s*horario\s*\}\}/g, vars.horario || '')
    .replace(/\{\{\s*servico\s*\}\}/g, vars.servico || '')
    .replace(/\{\{\s*profissional\s*\}\}/g, vars.profissional || '')
    .replace(/\{nome\}/g, vars.cliente || '')
    .replace(/\{servico\}/g, vars.servico || '')
    .replace(/\{data\}/g, vars.data || '')
    .replace(/\{horario\}/g, vars.horario || '');
}

async function sendViaEvolution(baseUrl: string, key: string, instance: string, phone: string, message: string) {
  const r = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key },
    body: JSON.stringify({ number: cleanPhoneBR(phone), text: message }),
  });
  if (!r.ok) throw new Error(`Evolution ${r.status}: ${await r.text()}`);
  return await r.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Auth: allow either (a) cron with shared secret OR (b) authenticated admin/receptionist user
  const cronSecret = Deno.env.get('CRON_SECRET');
  const providedCron = req.headers.get('x-cron-secret');
  const authHeader = req.headers.get('Authorization');
  let authorized = false;

  if (cronSecret && providedCron && providedCron === cronSecret) {
    authorized = true;
  } else if (authHeader?.startsWith('Bearer ')) {
    try {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const token = authHeader.replace('Bearer ', '');
      const { data: claimsData } = await userClient.auth.getClaims(token);
      const userId = claimsData?.claims?.sub;
      if (userId) {
        const { data: roles } = await userClient
          .from('user_roles')
          .select('role')
          .eq('user_id', userId);
        const roleNames = (roles || []).map((r: any) => r.role);
        if (roleNames.includes('admin') || roleNames.includes('receptionist')) {
          authorized = true;
        }
      }
    } catch (_) { /* fall through */ }
  }

  if (!authorized) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const summary: any = { sent: 0, skipped: 0, errors: [] as string[], byType: { reminder: 0, confirmation: 0, follow_up: 0, birthday: 0 } };

  try {
    const { data: settings } = await supabase.from('business_settings').select('automation_whatsapp_reminders').limit(1).maybeSingle();
    if (!settings?.automation_whatsapp_reminders) {
      return new Response(JSON.stringify({ success: true, message: 'Envios desativados', summary }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const evoUrlRaw = (Deno.env.get('EVOLUTION_API_URL') || '').trim();
    const evoKey = Deno.env.get('EVOLUTION_API_KEY');
    const defaultInstance = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'default';
    if (!evoUrlRaw || !evoKey) throw new Error('Evolution não configurado');
    const evoBase = new URL(evoUrlRaw).origin;

    // Load active templates
    const { data: templatesAll } = await supabase
      .from('whatsapp_templates')
      .select('*')
      .eq('is_active', true);
    const templates = templatesAll ?? [];

    const tplByType = (type: string) => templates.filter((t: any) => t.type === type);

    // Helper to pick the right template for a professional
    const pickTpl = (type: string, professional_id: string | null) => {
      const list = tplByType(type);
      const own = list.find((t: any) => t.professional_id === professional_id);
      return own || list.find((t: any) => t.professional_id == null) || null;
    };

    const instanceFor = async (professional_id: string | null): Promise<string> => {
      if (!professional_id) return defaultInstance;
      const { data } = await supabase.from('professionals').select('whatsapp_from_number').eq('id', professional_id).maybeSingle();
      const v = (data?.whatsapp_from_number || '').trim();
      return v.length > 0 ? v : defaultInstance;
    };

    const now = Date.now();

    // ============ REMINDERS (before appointment) ============
    const reminderTpls = tplByType('reminder');
    if (reminderTpls.length > 0) {
      const allHours = reminderTpls.map((t: any) => Number(t.hours_before)).filter((n: number) => Number.isFinite(n) && n > 0);
      if (allHours.length > 0) {
        const minH = Math.min(...allHours);
        const maxH = Math.max(...allHours);
        const fromIso = new Date(now + (minH - 1) * 3600_000).toISOString();
        const toIso = new Date(now + (maxH + 1) * 3600_000).toISOString();

        const { data: appts } = await supabase
          .from('appointments')
          .select('id, start_time, status, professional_id, client:clients(name, phone), service:services(name), professional:professionals(name)')
          .gte('start_time', fromIso)
          .lte('start_time', toIso)
          .not('status', 'in', '(cancelled,missed,rescheduled,completed)');

        for (const apt of appts || []) {
          const phone = (apt as any).client?.phone;
          if (!phone) { summary.skipped++; continue; }
          const start = new Date(apt.start_time as string);
          const hoursDiff = (start.getTime() - now) / 3600_000;
          const tpl = pickTpl('reminder', (apt as any).professional_id ?? null);
          if (!tpl) continue;
          const h = Number(tpl.hours_before);
          if (!(hoursDiff <= h && hoursDiff >= h - 0.5)) continue;

          const { data: existing } = await supabase
            .from('appointment_reminder_log')
            .select('id').eq('appointment_id', apt.id).eq('hours_before', h).eq('provider', 'whatsapp').maybeSingle();
          if (existing) continue;

          const message = renderTemplate(tpl.message, {
            cliente: (apt as any).client?.name || 'cliente',
            data: fmtDate(start), horario: fmtTime(start),
            servico: (apt as any).service?.name || 'atendimento',
            profissional: (apt as any).professional?.name || '',
          });
          try {
            const inst = await instanceFor((apt as any).professional_id ?? null);
            await sendViaEvolution(evoBase, evoKey, inst, phone, message);
            await supabase.from('appointment_reminder_log').insert({
              appointment_id: apt.id, hours_before: h, provider: 'whatsapp', channel: 'whatsapp', status: 'sent',
            });
            summary.sent++; summary.byType.reminder++;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            summary.errors.push(`reminder:${apt.id}@${h}h: ${msg}`);
          }
        }
      }
    }

    // ============ FOLLOW-UP (after appointment) ============
    const followTpls = tplByType('follow_up');
    if (followTpls.length > 0) {
      const offsets = followTpls.map((t: any) => Number(t.send_offset_hours)).filter((n: number) => Number.isFinite(n) && n > 0);
      if (offsets.length > 0) {
        const minO = Math.min(...offsets);
        const maxO = Math.max(...offsets);
        const fromIso = new Date(now - (maxO + 1) * 3600_000).toISOString();
        const toIso = new Date(now - (minO - 1) * 3600_000).toISOString();

        const { data: appts } = await supabase
          .from('appointments')
          .select('id, end_time, start_time, status, professional_id, client:clients(name, phone), service:services(name), professional:professionals(name)')
          .gte('end_time', fromIso)
          .lte('end_time', toIso)
          .eq('status', 'completed');

        for (const apt of appts || []) {
          const phone = (apt as any).client?.phone;
          if (!phone) { summary.skipped++; continue; }
          const end = new Date((apt as any).end_time || apt.start_time);
          const hoursAfter = (now - end.getTime()) / 3600_000;
          const tpl = pickTpl('follow_up', (apt as any).professional_id ?? null);
          if (!tpl) continue;
          const off = Number(tpl.send_offset_hours);
          if (!(hoursAfter >= off && hoursAfter <= off + 0.5)) continue;

          const { data: existing } = await supabase
            .from('appointment_reminder_log')
            .select('id').eq('appointment_id', apt.id).eq('hours_before', -off).eq('provider', 'whatsapp_followup').maybeSingle();
          if (existing) continue;

          const message = renderTemplate(tpl.message, {
            cliente: (apt as any).client?.name || 'cliente',
            data: fmtDate(end), horario: fmtTime(end),
            servico: (apt as any).service?.name || 'atendimento',
            profissional: (apt as any).professional?.name || '',
          });
          try {
            const inst = await instanceFor((apt as any).professional_id ?? null);
            await sendViaEvolution(evoBase, evoKey, inst, phone, message);
            await supabase.from('appointment_reminder_log').insert({
              appointment_id: apt.id, hours_before: -off, provider: 'whatsapp_followup', channel: 'whatsapp', status: 'sent',
            });
            summary.sent++; summary.byType.follow_up++;
          } catch (e) {
            summary.errors.push(`followup:${apt.id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }
    }

    // ============ BIRTHDAY ============
    const bdayTpls = tplByType('birthday');
    if (bdayTpls.length > 0) {
      const today = new Date();
      const nowHourLocal = Number(today.toLocaleString('pt-BR', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }));
      const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(today.getUTCDate()).padStart(2, '0');

      // Pull all clients with birthday today
      const { data: clients } = await supabase
        .from('clients')
        .select('id, name, phone, birthdate, assigned_professional_id')
        .not('birthdate', 'is', null);

      for (const c of clients || []) {
        if (!c.phone || !c.birthdate) continue;
        const bd = String(c.birthdate);
        if (bd.substring(5, 7) !== mm || bd.substring(8, 10) !== dd) continue;

        const tpl = pickTpl('birthday', (c as any).assigned_professional_id ?? null);
        if (!tpl) continue;
        const sendHour = Number(tpl.send_offset_hours ?? 9);
        if (nowHourLocal !== sendHour) continue;

        // Dedup: use appointment_reminder_log with appointment_id null is not allowed; use a key trick
        const dedupKey = `bday-${c.id}-${today.getUTCFullYear()}`;
        const { data: existing } = await supabase
          .from('appointment_reminder_log')
          .select('id').eq('provider', 'whatsapp_birthday').eq('error', dedupKey).maybeSingle();
        if (existing) continue;

        const message = renderTemplate(tpl.message, { cliente: c.name || 'cliente', data: '', horario: '', servico: '', profissional: '' });
        try {
          const inst = await instanceFor((c as any).assigned_professional_id ?? null);
          await sendViaEvolution(evoBase, evoKey, inst, c.phone, message);
          await supabase.from('appointment_reminder_log').insert({
            appointment_id: null, hours_before: sendHour, provider: 'whatsapp_birthday', channel: 'whatsapp', status: 'sent', error: dedupKey,
          });
          summary.sent++; summary.byType.birthday++;
        } catch (e) {
          summary.errors.push(`birthday:${c.id}: ${e instanceof Error ? e.message : String(e)}`);
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
