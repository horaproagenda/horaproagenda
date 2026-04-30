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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const today = new Date().toISOString().split('T')[0];

    // 1. Mark overdue boleto installments
    const { data: overdueInstallments, error: overdueError } = await supabase
      .from('boleto_installments')
      .update({ status: 'overdue', updated_at: new Date().toISOString() })
      .eq('status', 'pending')
      .lt('due_date', today)
      .select('id, sale_id');

    if (overdueError) {
      console.error('Error marking overdue boletos:', overdueError);
    }

    const markedOverdue = overdueInstallments?.length || 0;
    console.log(`Marked ${markedOverdue} boleto installments as overdue`);

    // 2. Mark overdue financial entries (receivable boletos)
    const { data: overdueEntries, error: entryError } = await supabase
      .from('financial_entries')
      .update({ status: 'overdue', updated_at: new Date().toISOString() })
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
      // Get client from sale
      const { data: sale } = await supabase
        .from('single_sales')
        .select('client_id')
        .eq('id', saleId)
        .single();

      if (!sale?.client_id) continue;

      // Get overdue count for this client
      const { count } = await supabase
        .from('boleto_installments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'overdue')
        .in('sale_id', 
          (await supabase
            .from('single_sales')
            .select('id')
            .eq('client_id', sale.client_id)
          ).data?.map(s => s.id) || []
        );

      if (count && count > 0) {
        // Update future appointments for this client with a note
        const { data: updated } = await supabase
          .from('appointments')
          .update({ 
            notes: `⚠️ Cliente com ${count} boleto(s) em atraso`,
            updated_at: new Date().toISOString()
          })
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
