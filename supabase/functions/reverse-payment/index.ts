import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReverseRequest {
  appointment_id: string;
}

type SupabaseClient = ReturnType<typeof createClient>;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function sumAmounts(rows: Array<{ amount?: number | string | null }> | null | undefined) {
  return (rows || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

async function checkUserRole(supabase: SupabaseClient, userId: string) {
  const { data: userRoles } = await supabase.from('user_roles').select('role').eq('user_id', userId);
  const roles = userRoles?.map((r: any) => r.role) || [];
  return { hasPermission: roles.includes('admin') || roles.includes('receptionist'), roles };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await authClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (claimsError || !claimsData?.user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claimsData.user.id;
    const { hasPermission } = await checkUserRole(authClient, userId);
    if (!hasPermission) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json() as ReverseRequest;
    if (!body.appointment_id) {
      return new Response(JSON.stringify({ success: false, error: 'appointment_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fetchAppointment = async (appointmentId: string) => supabase
      .from('appointments')
      .select('id, client_id, amount_paid, payment_status, payment_methods, discount_amount, package_appointment_id, professional_id')
      .eq('id', appointmentId)
      .maybeSingle();

    let { data: appointment, error: fetchError } = await fetchAppointment(body.appointment_id);
    let packageId: string | null = null;

    if (!appointment && !fetchError) {
      const { data: packageSession, error: packageSessionError } = await supabase
        .from('package_appointments')
        .select('id, appointment_id, package_id')
        .or(`id.eq.${body.appointment_id},appointment_id.eq.${body.appointment_id}`)
        .maybeSingle();

      if (packageSessionError) {
        console.error('reverse-payment package lookup error:', packageSessionError, 'id:', body.appointment_id);
      }

      if (packageSession?.appointment_id) {
        packageId = packageSession.package_id || null;
        const refetch = await fetchAppointment(packageSession.appointment_id);
        appointment = refetch.data;
        fetchError = refetch.error;
      }
    }

    if (fetchError || !appointment) {
      console.error('reverse-payment fetch error:', fetchError, 'id:', body.appointment_id);
      return jsonResponse({ success: false, error: 'Agendamento não encontrado para desfazer a baixa.', details: fetchError?.message }, 404);
    }

    if (!packageId && appointment.package_appointment_id) {
      const { data: packageSession } = await supabase
        .from('package_appointments')
        .select('package_id')
        .eq('id', appointment.package_appointment_id)
        .maybeSingle();
      packageId = packageSession?.package_id || null;
    }
    if (!packageId) {
      const { data: packageSession } = await supabase
        .from('package_appointments')
        .select('package_id')
        .eq('appointment_id', appointment.id)
        .maybeSingle();
      packageId = packageSession?.package_id || null;
    }

    let appointmentIds = [appointment.id];
    if (packageId) {
      const { data: siblings } = await supabase
        .from('package_appointments')
        .select('appointment_id')
        .eq('package_id', packageId)
        .not('appointment_id', 'is', null);
      const siblingIds = (siblings || []).map((s: any) => s.appointment_id).filter(Boolean);
      appointmentIds = [...new Set([appointment.id, ...siblingIds])];
    }

    const { data: creditHistoryRows } = await supabase
      .from('client_credit_transactions')
      .select('transaction_type, amount')
      .in('appointment_id', appointmentIds);
    const usedClientCredit = sumAmounts((creditHistoryRows || []).filter((row: any) => row.transaction_type === 'credit_used'));
    const addedCreditFromHistory = sumAmounts((creditHistoryRows || []).filter((row: any) => row.transaction_type === 'credit_added'));

    const { data: financialRows } = await supabase
      .from('financial_entries')
      .select('amount, description, notes')
      .in('appointment_id', appointmentIds);
    const addedCreditFromFinancial = sumAmounts((financialRows || []).filter((row: any) => {
      const text = `${row.description || ''} ${row.notes || ''}`.toLowerCase();
      return text.includes('saldo/troco') || text.includes('troco deixado como saldo');
    }));
    const creditToRemove = Math.max(addedCreditFromHistory, addedCreditFromFinancial);

    if ((usedClientCredit > 0 || creditToRemove > 0) && appointment.client_id) {
      const { data: client } = await supabase
        .from('clients')
        .select('credit_balance')
        .eq('id', appointment.client_id)
        .single();
      const previousBalance = Number(client?.credit_balance || 0);
      const newBalance = Math.max(0, previousBalance + usedClientCredit - creditToRemove);

      await supabase
        .from('clients')
        .update({ credit_balance: newBalance })
        .eq('id', appointment.client_id);

      await supabase.from('client_credit_transactions').insert({
        client_id: appointment.client_id,
        appointment_id: appointment.id,
        transaction_type: 'credit_adjustment',
        amount: Math.abs(newBalance - previousBalance),
        previous_balance: previousBalance,
        new_balance: newBalance,
        description: `Estorno da baixa: crédito usado devolvido (R$ ${usedClientCredit.toFixed(2)}) e saldo gerado removido (R$ ${creditToRemove.toFixed(2)})`,
        created_by: userId,
        professional_id: appointment.professional_id || null,
      });
    }

    const referenceIds = [...new Set([...appointmentIds, body.appointment_id])];
    await supabase.from('cash_transactions').delete().eq('reference_type', 'appointment').in('reference_id', referenceIds);
    await supabase.from('financial_entries').delete().in('appointment_id', appointmentIds);

    const resetPayload = {
      amount_paid: 0,
      payment_status: 'pending' as const,
      payment_methods: [] as string[],
      discount_amount: 0,
      updated_by: userId,
    };

    await supabase.from('appointments').update(resetPayload).in('id', appointmentIds);
    if (packageId) {
      await supabase.from('service_packages').update({ payment_methods: [] }).eq('id', packageId);
    }

    await supabase.from('audit_logs').insert({
      user_id: userId,
      action: 'reverse_payment',
      table_name: 'appointments',
      record_id: appointment.id,
      new_data: {
        requested_id: body.appointment_id,
        appointment_ids: appointmentIds,
        reversed_amount: appointment.amount_paid,
        refunded_credit: usedClientCredit,
        removed_client_credit: creditToRemove,
        package_id: packageId,
      },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('reverse-payment error:', err);
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
