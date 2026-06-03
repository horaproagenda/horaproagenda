import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - Missing token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // First validate the user token
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error('Auth validation error:', claimsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;
    console.log('Authenticated user:', userId);

    // Check if user has admin or receptionist role
    const { data: userRoles, error: rolesError } = await authClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    if (rolesError) {
      console.error('Error fetching user roles:', rolesError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to verify permissions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const roles = userRoles?.map(r => r.role) || [];
    const hasPermission = roles.includes('admin') || roles.includes('receptionist');

    if (!hasPermission) {
      return new Response(
        JSON.stringify({ success: false, error: 'Forbidden - Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role for data access
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const ultramsgBase = (Deno.env.get('ULTRAMSG_API_URL') || 'https://api.ultramsg.com').replace(/\/+$/, '');
    const ultramsgInstance = (Deno.env.get('ULTRAMSG_INSTANCE_ID') || '').trim();
    const ultramsgToken = (Deno.env.get('ULTRAMSG_TOKEN') || '').trim();

    console.log('Starting overdue bills notification check...');

    // Check if WhatsApp (UltraMsg) is configured
    if (!ultramsgInstance || !ultramsgToken) {
      console.log('UltraMsg not configured, skipping notifications');
      return new Response(
        JSON.stringify({
          success: false,
          message: 'UltraMsg not configured',
          sent: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get today's date
    const today = new Date().toISOString().split('T')[0];

    // Find overdue receivable entries with client info
    const { data: overdueEntries, error: entriesError } = await supabase
      .from('financial_entries')
      .select(`
        *,
        client:clients(id, name, phone)
      `)
      .eq('type', 'receivable')
      .eq('status', 'pending')
      .lt('due_date', today)
      .not('client_id', 'is', null);

    if (entriesError) {
      console.error('Error fetching overdue entries:', entriesError);
      throw entriesError;
    }

    console.log(`Found ${overdueEntries?.length || 0} overdue entries`);

    let sentCount = 0;
    const errors: string[] = [];

    for (const entry of overdueEntries || []) {
      if (!entry.client?.phone) {
        console.log(`Skipping entry ${entry.id}: no phone number`);
        continue;
      }

      // Clean phone number
      let phone = entry.client.phone.replace(/\D/g, '');
      if (!phone.startsWith('55') && phone.length <= 11) {
        phone = '55' + phone;
      }

      // Format due date
      const dueDate = new Date(entry.due_date + 'T12:00:00');
      const formattedDate = dueDate.toLocaleDateString('pt-BR');
      
      // Calculate days overdue
      const diffTime = new Date().getTime() - dueDate.getTime();
      const daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // Build message
      const message = `Olá ${entry.client.name}! 👋\n\nIdentificamos que você possui um pagamento pendente:\n\n📋 *${entry.description}*\n💰 Valor: R$ ${Number(entry.amount).toFixed(2)}\n📅 Vencimento: ${formattedDate}\n⏰ Atraso: ${daysOverdue} dia${daysOverdue > 1 ? 's' : ''}\n\nPor favor, entre em contato conosco para regularizar sua situação.\n\nAgradecemos a compreensão! 🙏`;

      try {
        console.log(`Sending notification to ${entry.client.name} (${phone})`);

        const form = new URLSearchParams();
        form.set('token', ultramsgToken);
        form.set('to', phone);
        form.set('body', message);

        const response = await fetch(`${ultramsgBase}/${encodeURIComponent(ultramsgInstance)}/messages/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form.toString(),
        });

        if (response.ok) {
          sentCount++;
          console.log(`Successfully sent notification for entry ${entry.id}`);
        } else {
          const errorText = await response.text();
          console.error(`Failed to send notification for entry ${entry.id}:`, errorText);
          errors.push(`Entry ${entry.id}: ${errorText}`);
        }
      } catch (sendError: unknown) {
        const errorMessage = sendError instanceof Error ? sendError.message : String(sendError);
        console.error(`Error sending notification for entry ${entry.id}:`, sendError);
        errors.push(`Entry ${entry.id}: ${errorMessage}`);
      }
    }

    console.log(`Notification process completed. Sent: ${sentCount}, Errors: ${errors.length}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Sent ${sentCount} notifications`,
        sent: sentCount,
        total: overdueEntries?.length || 0,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in notify-overdue-bills:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
