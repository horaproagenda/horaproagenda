import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // --- AuthN/AuthZ: require valid JWT and admin/receptionist role ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claimsData.claims.sub;

    // Service-role client for the actual writes (bypasses RLS), gated by role check below
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: roleRows, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    if (roleError) {
      return new Response(JSON.stringify({ error: 'Role lookup failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const roles = (roleRows ?? []).map((r: any) => r.role);
    if (!roles.includes('admin') && !roles.includes('receptionist')) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve caller's tenant (account_owner_id) for strict tenant scoping
    const { data: callerProfile, error: profileError } = await supabase
      .from('profiles')
      .select('account_owner_id')
      .eq('id', userId)
      .maybeSingle();

    if (profileError || !callerProfile?.account_owner_id) {
      console.error('Profile lookup failed:', profileError);
      return new Response(JSON.stringify({ error: 'Tenant context not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const callerOwner = callerProfile.account_owner_id;

    const today = new Date().toISOString().split('T')[0];

    // 1. Mark overdue boleto installments — scoped to caller's tenant
    const { data: overdueInstallments, error: overdueError } = await supabase
      .from('boleto_installments')
      .update({ status: 'overdue', updated_at: new Date().toISOString() })
      .eq('account_owner_id', callerOwner)
      .eq('status', 'pending')
      .lt('due_date', today)
      .select('id, sale_id');

    if (overdueError) {
      console.error('Error marking overdue boletos:', overdueError);
    }

    // Log audit for each synced installment
    if (overdueInstallments && overdueInstallments.length > 0) {
      const auditLogs = overdueInstallments.map((inst: any) => ({
        boleto_installment_id: inst.id,
        sale_id: inst.sale_id,
        event_type: 'sync',
        event_source: 'system',
        previous_status: 'pending',
        new_status: 'overdue',
        notes: `Sincronização automática: marcado como atrasado em ${today}`,
      }));
      await supabase.from('boleto_audit_log').insert(auditLogs);
    }

    const markedOverdue = overdueInstallments?.length || 0;
    console.log(`Marked ${markedOverdue} boleto installments as overdue for tenant ${callerOwner}`);

    // 2. Mark overdue financial entries (receivable boletos) — scoped to caller's tenant
    const { data: overdueEntries, error: entryError } = await supabase
      .from('financial_entries')
      .update({ status: 'overdue', updated_at: new Date().toISOString() })
      .eq('account_owner_id', callerOwner)
      .eq('status', 'pending')
      .eq('type', 'receivable')
      .lt('due_date', today)
      .ilike('description', '%boleto%')
      .select('id');

    if (entryError) {
      console.error('Error marking overdue financial entries:', entryError);
    }

    const markedEntries = overdueEntries?.length || 0;
    console.log(`Marked ${markedEntries} financial entries as overdue`);

    // 3. Sync appointment payment notes for clients with overdue boletos
    const affectedSaleIds = [...new Set(overdueInstallments?.map(i => i.sale_id) || [])];

    let updatedAppointments = 0;
    for (const saleId of affectedSaleIds) {
      // Get client from sale — scoped to caller's tenant
      const { data: sale } = await supabase
        .from('single_sales')
        .select('client_id, account_owner_id')
        .eq('id', saleId)
        .eq('account_owner_id', callerOwner)
        .maybeSingle();

      if (!sale?.client_id) continue;

      // Get overdue count for this client (tenant-scoped)
      const { data: clientSales } = await supabase
        .from('single_sales')
        .select('id')
        .eq('client_id', sale.client_id)
        .eq('account_owner_id', callerOwner);

      const saleIds = clientSales?.map(s => s.id) || [];
      if (saleIds.length === 0) continue;

      const { count } = await supabase
        .from('boleto_installments')
        .select('*', { count: 'exact', head: true })
        .eq('account_owner_id', callerOwner)
        .eq('status', 'overdue')
        .in('sale_id', saleIds);

      if (count && count > 0) {
        // Update future appointments for this client with a note — tenant-scoped
        const { data: updated } = await supabase
          .from('appointments')
          .update({
            notes: `⚠️ Cliente com ${count} boleto(s) em atraso`,
            updated_at: new Date().toISOString()
          })
          .eq('account_owner_id', callerOwner)
          .eq('client_id', sale.client_id)
          .gte('date', today)
          .in('status', ['scheduled', 'confirmed'])
          .select('id');

        updatedAppointments += updated?.length || 0;
      }
    }

    console.log(`Updated ${updatedAppointments} appointments with overdue alerts`);

    return new Response(
      JSON.stringify({
        success: true,
        marked_overdue_installments: markedOverdue,
        marked_overdue_entries: markedEntries,
        updated_appointments: updatedAppointments,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('sync-boleto-status error:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
