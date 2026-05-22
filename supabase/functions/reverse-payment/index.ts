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

    // Fetch the appointment for context (client_id, used_client_credit, amount_paid)
    const { data: appointment, error: fetchError } = await supabase
      .from('appointments')
      .select('id, client_id, amount_paid, used_client_credit')
      .eq('id', body.appointment_id)
      .maybeSingle();

    if (fetchError || !appointment) {
      console.error('reverse-payment fetch error:', fetchError, 'id:', body.appointment_id);
      return new Response(JSON.stringify({ success: false, error: 'Appointment not found', details: fetchError?.message }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Look up package separately (avoids join failing the whole query)
    const { data: pkgRow } = await supabase
      .from('package_appointments')
      .select('package_id')
      .eq('appointment_id', body.appointment_id)
      .maybeSingle();
    const packageId = pkgRow?.package_id || null;
    const usedClientCredit = Number((appointment as any).used_client_credit || 0);

    // 1) Refund client credit if it was used
    if (usedClientCredit > 0 && appointment.client_id) {
      const { data: client } = await supabase
        .from('clients')
        .select('credit_balance')
        .eq('id', appointment.client_id)
        .single();
      const currentBalance = Number(client?.credit_balance || 0);
      await supabase
        .from('clients')
        .update({ credit_balance: currentBalance + usedClientCredit })
        .eq('id', appointment.client_id);
    }

    // 2) Delete related cash_transactions and financial_entries that referenced this appointment
    await supabase.from('cash_transactions').delete().eq('appointment_id', body.appointment_id);
    await supabase.from('financial_entries').delete().eq('appointment_id', body.appointment_id);

    // 3) Reset the appointment(s)
    const resetPayload = {
      amount_paid: 0,
      payment_status: 'pending' as const,
      payment_methods: [] as string[],
      used_client_credit: 0,
      card_fee_amount: 0,
      installments: null,
      discount_amount: 0,
      payment_method_name: null,
      updated_by: userId,
    };

    let updateQuery = supabase.from('appointments').update(resetPayload);
    if (packageId) {
      // reset all sibling appointments in the package
      const { data: siblings } = await supabase
        .from('package_appointments')
        .select('appointment_id')
        .eq('package_id', packageId)
        .not('appointment_id', 'is', null);
      const ids = (siblings || []).map((s: any) => s.appointment_id).filter(Boolean);
      if (ids.length) await supabase.from('appointments').update(resetPayload).in('id', ids);
      // also clear package payment_methods
      await supabase.from('service_packages').update({ payment_methods: [] }).eq('id', packageId);
    } else {
      await updateQuery.eq('id', body.appointment_id);
    }

    // 4) Audit log
    await supabase.from('audit_logs').insert({
      user_id: userId,
      action: 'reverse_payment',
      table_name: 'appointments',
      record_id: body.appointment_id,
      details: { reversed_amount: appointment.amount_paid, refunded_credit: usedClientCredit, package_id: packageId },
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
