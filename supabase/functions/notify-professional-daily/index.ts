// Envia ao WhatsApp do profissional (dona da conta) um resumo diário com:
//  - Contas (pagar/receber) vencendo HOJE
//  - Lembretes agendados para HOJE
//
// Pode ser invocada manualmente (com JWT) ou via pg_cron diariamente
// (passando `?cron=1` + header `x-cron-secret`).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveProfessionalCreds, ultramsgSendText, normalizeBrPhone } from '../_shared/ultramsg.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

interface Owner {
  account_owner_id: string;
  phone: string | null;
  name: string | null;
}

function brl(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDateBR(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR');
}

async function buildAndSendFor(supabase: any, owner: Owner, today: string) {
  const phone = (owner.phone || '').replace(/\D/g, '');
  if (!phone) return { skipped: true, reason: 'sem telefone' };

  // Contas vencendo hoje (pagar + receber)
  const { data: bills } = await supabase
    .from('financial_entries')
    .select('id, type, description, amount, due_date, status')
    .eq('account_owner_id', owner.account_owner_id)
    .eq('status', 'pending')
    .eq('due_date', today);

  // Lembretes de hoje (ativos, não concluídos)
  const { data: reminders } = await supabase
    .from('reminders')
    .select('id, title, description, reminder_time, priority')
    .eq('account_owner_id', owner.account_owner_id)
    .eq('is_active', true)
    .eq('is_completed', false)
    .eq('reminder_date', today)
    .order('reminder_time', { ascending: true, nullsFirst: false });

  const billList = bills || [];
  const remList = reminders || [];
  if (billList.length === 0 && remList.length === 0) {
    return { skipped: true, reason: 'sem contas/lembretes hoje' };
  }

  const parts: string[] = [];
  parts.push(`📅 *Resumo do dia ${fmtDateBR(today)}* — Hora Pro`);
  if (owner.name) parts.push(`Olá, ${owner.name.split(' ')[0]}!`);

  if (billList.length > 0) {
    parts.push('');
    parts.push('💰 *Contas vencendo hoje*');
    for (const b of billList) {
      const tag = b.type === 'payable' ? 'A pagar' : 'A receber';
      parts.push(`• [${tag}] ${b.description} — ${brl(Number(b.amount))}`);
    }
  }

  if (remList.length > 0) {
    parts.push('');
    parts.push('⏰ *Lembretes de hoje*');
    for (const r of remList) {
      const t = r.reminder_time ? ` (${String(r.reminder_time).substring(0, 5)})` : '';
      const prio = r.priority === 'high' ? ' ❗' : '';
      parts.push(`• ${r.title}${t}${prio}`);
    }
  }

  parts.push('');
  parts.push('Acesse o app para detalhes: https://horaproagenda.app');

  const body = parts.join('\n');

  // Resolve credenciais (profissional → fallback global)
  const { data: prof } = await supabase
    .from('professionals')
    .select('id')
    .eq('account_owner_id', owner.account_owner_id)
    .eq('user_id', owner.account_owner_id)
    .maybeSingle();

  const { creds } = await resolveProfessionalCreds(supabase, prof?.id || null);
  if (!creds) return { skipped: true, reason: 'sem credencial whatsapp' };

  try {
    await ultramsgSendText({ to: normalizeBrPhone(phone), body }, creds);
    return { sent: true, bills: billList.length, reminders: remList.length };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const isCron = url.searchParams.get('cron') === '1';

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;

    let scopedOwnerId: string | null = null;

    if (!isCron) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const authClient = createClient(supabaseUrl, supabaseAnon, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claims, error: cErr } = await authClient.auth.getClaims(authHeader.replace('Bearer ', ''));
      if (cErr || !claims?.claims) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const uid = claims.claims.sub;
      const { data: prof } = await authClient.from('profiles').select('account_owner_id').eq('id', uid).maybeSingle();
      if (!prof?.account_owner_id) {
        return new Response(JSON.stringify({ error: 'no tenant' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      scopedOwnerId = prof.account_owner_id;
    }

    const supabase = createClient(supabaseUrl, supabaseService);
    const today = new Date().toISOString().split('T')[0];

    // Lista dos donos de conta a notificar (profissional admin de cada tenant)
    let ownersQuery = supabase
      .from('professionals')
      .select('account_owner_id, phone, name, user_id')
      .eq('is_active', true)
      .not('phone', 'is', null);
    if (scopedOwnerId) ownersQuery = ownersQuery.eq('account_owner_id', scopedOwnerId);
    const { data: profs } = await ownersQuery;

    // Deduplica por account_owner_id (prefere o profissional cujo user_id = account_owner_id)
    const byOwner = new Map<string, Owner>();
    for (const p of profs || []) {
      const ownerId = (p as any).account_owner_id;
      if (!ownerId) continue;
      const existing = byOwner.get(ownerId);
      const isAdminMatch = (p as any).user_id === ownerId;
      if (!existing || isAdminMatch) {
        byOwner.set(ownerId, {
          account_owner_id: ownerId,
          phone: (p as any).phone || null,
          name: (p as any).name || null,
        });
      }
    }

    const results: any[] = [];
    for (const owner of byOwner.values()) {
      try {
        const r = await buildAndSendFor(supabase, owner, today);
        results.push({ owner: owner.account_owner_id, ...r });
      } catch (err) {
        results.push({
          owner: owner.account_owner_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        date: today,
        owners: results.length,
        sent: results.filter((r) => r.sent).length,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[notify-professional-daily] erro:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
