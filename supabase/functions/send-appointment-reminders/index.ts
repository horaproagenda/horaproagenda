import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ultramsgSendText, resolveProfessionalCreds } from "../_shared/ultramsg.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

function currentHourSP(): number {
  const now = new Date();
  return Number(now.toLocaleString('pt-BR', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }));
}

/**
 * Determine effective window for a given professional + template.
 * Professional-level quiet hours OVERRIDE template-level when both ends are set.
 */
function resolveWindow(prof: any, tpl: any): { start: number | null; end: number | null } {
  const ps = prof?.quiet_hours_start;
  const pe = prof?.quiet_hours_end;
  if (ps != null && pe != null && Number.isFinite(Number(ps)) && Number.isFinite(Number(pe)) && Number(ps) !== Number(pe)) {
    return { start: Number(ps), end: Number(pe) };
  }
  const ts = tpl?.quiet_hours_start;
  const te = tpl?.quiet_hours_end;
  if (ts != null && te != null) return { start: Number(ts), end: Number(te) };
  return { start: null, end: null };
}

function withinWindow(start: number | null, end: number | null, hour: number): boolean {
  if (start == null || end == null || start === end) return true;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

/** Compute the next datetime (UTC) when `hour` falls inside [start, end) in America/Sao_Paulo. */
function nextWindowOpenUtc(start: number, end: number): Date {
  // Iterate hour by hour starting at the next full hour SP.
  const now = new Date();
  for (let i = 0; i < 48; i++) {
    const candidate = new Date(now.getTime() + i * 3600_000);
    const h = Number(candidate.toLocaleString('pt-BR', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }));
    if (withinWindow(start, end, h)) return candidate;
  }
  return new Date(now.getTime() + 3600_000);
}

function backoffMs(attempts: number): number {
  // 1, 5, 15, 30, 60, 120, 240 minutes... cap at 4h
  const minutes = Math.min(240, Math.round(Math.pow(2, attempts) * 1.5));
  return Math.max(60_000, minutes * 60_000);
}

async function enqueueRetry(
  supabase: any,
  payload: {
    to: string; body: string; appointment_id?: string | null; professional_id?: string | null;
    template_type?: string; hours_before?: number; provider?: string; dedup_key?: string; reason?: string;
    error?: string;
  },
) {
  try {
    const next = new Date(Date.now() + backoffMs(0)).toISOString();
    await supabase.from('whatsapp_send_queue').upsert({
      to_phone: payload.to,
      body: payload.body,
      appointment_id: payload.appointment_id ?? null,
      professional_id: payload.professional_id ?? null,
      template_type: payload.template_type ?? null,
      hours_before: payload.hours_before ?? null,
      provider: payload.provider ?? 'whatsapp',
      dedup_key: payload.dedup_key ?? null,
      reason: payload.reason ?? null,
      last_error: payload.error ?? null,
      next_attempt_at: next,
      status: 'pending',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'dedup_key', ignoreDuplicates: false });
  } catch (e) {
    console.warn('enqueueRetry failed:', e);
  }
}

async function processQueue(supabase: any, summary: any) {
  const { data: pending } = await supabase
    .from('whatsapp_send_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(50);

  for (const row of pending || []) {
    if ((row.attempts ?? 0) >= (row.max_attempts ?? 8)) {
      await supabase.from('whatsapp_send_queue').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', row.id);
      continue;
    }
    try {
      const { creds } = await resolveProfessionalCreds(supabase, row.professional_id);
      await ultramsgSendText({ to: row.to_phone, body: row.body }, creds);
      await supabase.from('whatsapp_send_queue').update({
        status: 'sent', updated_at: new Date().toISOString(), attempts: (row.attempts ?? 0) + 1,
      }).eq('id', row.id);
      if (row.appointment_id && row.provider) {
        await supabase.from('appointment_reminder_log').insert({
          appointment_id: row.appointment_id,
          hours_before: row.hours_before ?? 0,
          provider: row.provider,
          channel: 'whatsapp',
          status: 'sent',
        });
      }
      summary.retriedSent = (summary.retriedSent || 0) + 1;
    } catch (e) {
      const nextAttempts = (row.attempts ?? 0) + 1;
      const isFinal = nextAttempts >= (row.max_attempts ?? 8);
      await supabase.from('whatsapp_send_queue').update({
        attempts: nextAttempts,
        last_error: e instanceof Error ? e.message : String(e),
        status: isFinal ? 'failed' : 'pending',
        next_attempt_at: new Date(Date.now() + backoffMs(nextAttempts)).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', row.id);
      summary.retriedFailed = (summary.retriedFailed || 0) + 1;
    }
  }
}

/** Try to send; on failure, enqueue for retry. */
async function trySend(
  supabase: any,
  payload: {
    to: string; body: string; appointment_id?: string | null; professional_id?: string | null;
    template_type?: string; hours_before?: number; provider?: string; dedup_key?: string;
  },
  summary: any,
): Promise<boolean> {
  try {
    const { creds } = await resolveProfessionalCreds(supabase, payload.professional_id ?? null);
    await ultramsgSendText({ to: payload.to, body: payload.body }, creds);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await enqueueRetry(supabase, { ...payload, error: msg, reason: 'send_failed' });
    summary.queued = (summary.queued || 0) + 1;
    summary.errors.push(`${payload.template_type}:${payload.appointment_id}: ${msg}`);
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

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
        const { data: roles } = await userClient.from('user_roles').select('role').eq('user_id', userId);
        const roleNames = (roles || []).map((r: any) => r.role);
        if (roleNames.includes('admin') || roleNames.includes('receptionist')) authorized = true;
      }
    } catch (_) { /* fall through */ }
  }

  if (!authorized) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const summary: any = { sent: 0, skipped: 0, skippedByWindow: 0, queued: 0, retriedSent: 0, retriedFailed: 0, errors: [] as string[], byType: { reminder: 0, confirmation: 0, follow_up: 0, birthday: 0 } };

  try {
    const { data: settings } = await supabase.from('business_settings').select('automation_whatsapp_reminders').limit(1).maybeSingle();
    if (!settings?.automation_whatsapp_reminders) {
      return new Response(JSON.stringify({ success: true, message: 'Envios desativados', summary }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // First, drain retry queue
    await processQueue(supabase, summary);

    const { data: templatesAll } = await supabase.from('whatsapp_templates').select('*').eq('is_active', true);
    const templates = templatesAll ?? [];
    const tplByType = (type: string) => templates.filter((t: any) => t.type === type);
    const pickTpl = (type: string, professional_id: string | null) => {
      const list = tplByType(type);
      const own = list.find((t: any) => t.professional_id === professional_id);
      return own || list.find((t: any) => t.professional_id == null) || null;
    };

    // Load all professionals' quiet hours into a map
    const { data: profsRaw } = await supabase.from('professionals').select('id, quiet_hours_start, quiet_hours_end');
    const profMap = new Map<string, any>();
    for (const p of profsRaw || []) profMap.set(p.id, p);
    const getProf = (id: string | null) => (id ? profMap.get(id) || null : null);

    const now = Date.now();
    const hourSP = currentHourSP();

    /** Check window; if outside, enqueue for next window open (so it gets sent when window opens). */
    const guardWindow = async (
      prof: any,
      tpl: any,
      payload: Parameters<typeof trySend>[1],
    ): Promise<boolean> => {
      const w = resolveWindow(prof, tpl);
      if (withinWindow(w.start, w.end, hourSP)) return true;
      // outside window → schedule retry at next open
      const nextAt = (w.start != null && w.end != null) ? nextWindowOpenUtc(w.start, w.end) : new Date(now + 3600_000);
      try {
        await supabase.from('whatsapp_send_queue').upsert({
          to_phone: payload.to,
          body: payload.body,
          appointment_id: payload.appointment_id ?? null,
          professional_id: payload.professional_id ?? null,
          template_type: payload.template_type ?? null,
          hours_before: payload.hours_before ?? null,
          provider: payload.provider ?? 'whatsapp',
          dedup_key: payload.dedup_key ?? null,
          reason: 'outside_window',
          next_attempt_at: nextAt.toISOString(),
          status: 'pending',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'dedup_key', ignoreDuplicates: false });
      } catch (_) { /* ignore */ }
      summary.skippedByWindow++;
      summary.queued++;
      return false;
    };

    // ============ REMINDERS ============
    const reminderTpls = tplByType('reminder');
    if (reminderTpls.length > 0) {
      const allHours = reminderTpls.map((t: any) => Number(t.hours_before)).filter((n: number) => Number.isFinite(n) && n > 0);
      if (allHours.length > 0) {
        const minH = Math.min(...allHours); const maxH = Math.max(...allHours);
        const fromIso = new Date(now + (minH - 1) * 3600_000).toISOString();
        const toIso = new Date(now + (maxH + 1) * 3600_000).toISOString();
        const { data: appts } = await supabase
          .from('appointments')
          .select('id, start_time, status, professional_id, client:clients(name, phone), service:services(name), professional:professionals(name)')
          .gte('start_time', fromIso).lte('start_time', toIso)
          .not('status', 'in', '(cancelled,missed,rescheduled,completed)');

        for (const apt of appts || []) {
          const phone = (apt as any).client?.phone;
          if (!phone) { summary.skipped++; continue; }
          const start = new Date(apt.start_time as string);
          const hoursDiff = (start.getTime() - now) / 3600_000;
          const profId = (apt as any).professional_id ?? null;
          const tpl = pickTpl('reminder', profId);
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
          const payload = {
            to: phone, body: message, appointment_id: apt.id, professional_id: profId,
            template_type: 'reminder', hours_before: h, provider: 'whatsapp',
            dedup_key: `reminder-${apt.id}-${h}`,
          };
          if (!(await guardWindow(getProf(profId), tpl, payload))) continue;
          const ok = await trySend(supabase, payload, summary);
          if (ok) {
            await supabase.from('appointment_reminder_log').insert({
              appointment_id: apt.id, hours_before: h, provider: 'whatsapp', channel: 'whatsapp', status: 'sent',
            });
            summary.sent++; summary.byType.reminder++;
          }
        }
      }
    }

    // ============ CONFIRMATION ============
    const confirmTpls = tplByType('confirmation');
    if (confirmTpls.length > 0) {
      const allHours = confirmTpls.map((t: any) => Number(t.hours_before)).filter((n: number) => Number.isFinite(n) && n > 0);
      if (allHours.length > 0) {
        const minH = Math.min(...allHours); const maxH = Math.max(...allHours);
        const fromIso = new Date(now + (minH - 1) * 3600_000).toISOString();
        const toIso = new Date(now + (maxH + 1) * 3600_000).toISOString();
        const { data: appts } = await supabase
          .from('appointments')
          .select('id, start_time, status, professional_id, client:clients(name, phone), service:services(name), professional:professionals(name)')
          .gte('start_time', fromIso).lte('start_time', toIso)
          .not('status', 'in', '(cancelled,missed,rescheduled,completed)');

        for (const apt of appts || []) {
          const phone = (apt as any).client?.phone;
          if (!phone) { summary.skipped++; continue; }
          const start = new Date(apt.start_time as string);
          const hoursDiff = (start.getTime() - now) / 3600_000;
          const profId = (apt as any).professional_id ?? null;
          const tpl = pickTpl('confirmation', profId);
          if (!tpl) continue;
          const h = Number(tpl.hours_before);
          if (!(hoursDiff <= h && hoursDiff >= h - 0.5)) continue;

          const { data: existing } = await supabase
            .from('appointment_reminder_log')
            .select('id').eq('appointment_id', apt.id).eq('hours_before', h).eq('provider', 'whatsapp_confirmation').maybeSingle();
          if (existing) continue;

          const message = renderTemplate(tpl.message, {
            cliente: (apt as any).client?.name || 'cliente',
            data: fmtDate(start), horario: fmtTime(start),
            servico: (apt as any).service?.name || 'atendimento',
            profissional: (apt as any).professional?.name || '',
          });
          const payload = {
            to: phone, body: message, appointment_id: apt.id, professional_id: profId,
            template_type: 'confirmation', hours_before: h, provider: 'whatsapp_confirmation',
            dedup_key: `confirmation-${apt.id}-${h}`,
          };
          if (!(await guardWindow(getProf(profId), tpl, payload))) continue;
          const ok = await trySend(supabase, payload, summary);
          if (ok) {
            await supabase.from('appointment_reminder_log').insert({
              appointment_id: apt.id, hours_before: h, provider: 'whatsapp_confirmation', channel: 'whatsapp', status: 'sent',
            });
            summary.sent++; summary.byType.confirmation++;
          }
        }
      }
    }

    // ============ FOLLOW-UP ============
    const followTpls = tplByType('follow_up');
    if (followTpls.length > 0) {
      const offsets = followTpls.map((t: any) => Number(t.send_offset_hours)).filter((n: number) => Number.isFinite(n) && n > 0);
      if (offsets.length > 0) {
        const minO = Math.min(...offsets); const maxO = Math.max(...offsets);
        const fromIso = new Date(now - (maxO + 1) * 3600_000).toISOString();
        const toIso = new Date(now - (minO - 1) * 3600_000).toISOString();
        const { data: appts } = await supabase
          .from('appointments')
          .select('id, end_time, start_time, status, professional_id, client:clients(name, phone), service:services(name), professional:professionals(name)')
          .gte('end_time', fromIso).lte('end_time', toIso).eq('status', 'completed');

        for (const apt of appts || []) {
          const phone = (apt as any).client?.phone;
          if (!phone) { summary.skipped++; continue; }
          const end = new Date((apt as any).end_time || apt.start_time);
          const hoursAfter = (now - end.getTime()) / 3600_000;
          const profId = (apt as any).professional_id ?? null;
          const tpl = pickTpl('follow_up', profId);
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
          const payload = {
            to: phone, body: message, appointment_id: apt.id, professional_id: profId,
            template_type: 'follow_up', hours_before: -off, provider: 'whatsapp_followup',
            dedup_key: `followup-${apt.id}-${off}`,
          };
          if (!(await guardWindow(getProf(profId), tpl, payload))) continue;
          const ok = await trySend(supabase, payload, summary);
          if (ok) {
            await supabase.from('appointment_reminder_log').insert({
              appointment_id: apt.id, hours_before: -off, provider: 'whatsapp_followup', channel: 'whatsapp', status: 'sent',
            });
            summary.sent++; summary.byType.follow_up++;
          }
        }
      }
    }

    // ============ BIRTHDAY ============
    const bdayTpls = tplByType('birthday');
    if (bdayTpls.length > 0) {
      const today = new Date();
      const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(today.getUTCDate()).padStart(2, '0');

      const { data: clients } = await supabase
        .from('clients').select('id, name, phone, birthdate, assigned_professional_id').not('birthdate', 'is', null);

      for (const c of clients || []) {
        if (!c.phone || !c.birthdate) continue;
        const bd = String(c.birthdate);
        if (bd.substring(5, 7) !== mm || bd.substring(8, 10) !== dd) continue;
        const profId = (c as any).assigned_professional_id ?? null;
        const tpl = pickTpl('birthday', profId);
        if (!tpl) continue;
        const sendHour = Number(tpl.send_offset_hours ?? 9);
        if (hourSP !== sendHour) continue;

        const dedupKey = `bday-${c.id}-${today.getUTCFullYear()}`;
        const { data: existing } = await supabase
          .from('appointment_reminder_log').select('id').eq('provider', 'whatsapp_birthday').eq('error', dedupKey).maybeSingle();
        if (existing) continue;

        const message = renderTemplate(tpl.message, { cliente: c.name || 'cliente', data: '', horario: '', servico: '', profissional: '' });
        const payload = {
          to: c.phone, body: message, appointment_id: null, professional_id: profId,
          template_type: 'birthday', hours_before: sendHour, provider: 'whatsapp_birthday',
          dedup_key: dedupKey,
        };
        if (!(await guardWindow(getProf(profId), tpl, payload))) continue;
        const ok = await trySend(supabase, payload, summary);
        if (ok) {
          await supabase.from('appointment_reminder_log').insert({
            appointment_id: null, hours_before: sendHour, provider: 'whatsapp_birthday', channel: 'whatsapp', status: 'sent', error: dedupKey,
          });
          summary.sent++; summary.byType.birthday++;
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
