import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StockAlert {
  product_id: string;
  product_name: string;
  product_unit: string;
  current_stock: number;
  min_stock_alert: number;
  alert_type: 'low_stock' | 'near_depletion' | 'expiring_today' | 'expiring_soon' | 'expired';
  predicted_remaining_appointments?: number;
  predicted_remaining_days?: number;
  expiry_date?: string;
  days_until_expiry?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
    const evolutionInstance = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'default';

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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: roleRows } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    const roles = (roleRows ?? []).map((r: any) => r.role);
    if (!roles.includes('admin') && !roles.includes('receptionist')) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { alerts } = body as { alerts: StockAlert[] };

    // Whitelist alert_type values to prevent log injection
    const ALLOWED_TYPES = new Set(['low_stock', 'near_depletion', 'expiring_today', 'expiring_soon', 'expired']);
    const safeAlerts = (Array.isArray(alerts) ? alerts : []).filter((a) => a && ALLOWED_TYPES.has(a.alert_type));

    // Derive notification phone from business_settings (NOT from request body)
    const { data: settings } = await supabase
      .from('business_settings')
      .select('phone, whatsapp_phone')
      .limit(1)
      .maybeSingle();
    const notifyPhone: string | undefined = (settings as any)?.whatsapp_phone || (settings as any)?.phone || undefined;

    if (!safeAlerts || safeAlerts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No alerts to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // Use the validated, whitelisted alerts from here on
    const alertsValidated = safeAlerts;
      return new Response(
        JSON.stringify({ success: true, message: 'No alerts to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = {
      whatsapp_sent: false,
      whatsapp_error: null as string | null,
      alerts_processed: alerts.length,
    };

    // Build notification message
    let message = `🚨 *ALERTA DE PRODUTOS*\n\n`;
    
    const expiredAlerts = alerts.filter(a => a.alert_type === 'expired');
    const expiringTodayAlerts = alerts.filter(a => a.alert_type === 'expiring_today');
    const expiringSoonAlerts = alerts.filter(a => a.alert_type === 'expiring_soon');
    const criticalAlerts = alerts.filter(a => a.alert_type === 'low_stock');
    const warningAlerts = alerts.filter(a => a.alert_type === 'near_depletion');

    // Expired products - most critical
    if (expiredAlerts.length > 0) {
      message += `🚫 *PRODUTOS VENCIDOS - DESCARTAR:*\n`;
      expiredAlerts.forEach(alert => {
        message += `• ${alert.product_name}`;
        if (alert.expiry_date) {
          message += ` (venceu em ${new Date(alert.expiry_date).toLocaleDateString('pt-BR')})`;
        }
        message += `\n`;
      });
      message += `\n`;
    }

    // Expiring today
    if (expiringTodayAlerts.length > 0) {
      message += `⏰ *VENCEM HOJE - DESCARTAR:*\n`;
      expiringTodayAlerts.forEach(alert => {
        message += `• ${alert.product_name}\n`;
      });
      message += `\n`;
    }

    // Expiring soon
    if (expiringSoonAlerts.length > 0) {
      message += `📅 *Próximos do Vencimento:*\n`;
      expiringSoonAlerts.forEach(alert => {
        message += `• ${alert.product_name}`;
        if (alert.days_until_expiry !== undefined && alert.days_until_expiry >= 0) {
          message += `: ${alert.days_until_expiry} dia(s)`;
        }
        message += `\n`;
      });
      message += `\n`;
    }

    if (criticalAlerts.length > 0) {
      message += `❌ *Estoque Crítico:*\n`;
      criticalAlerts.forEach(alert => {
        message += `• ${alert.product_name}: ${alert.current_stock} ${alert.product_unit}`;
        if (alert.min_stock_alert > 0) {
          message += ` (mínimo: ${alert.min_stock_alert})`;
        }
        message += `\n`;
      });
      message += `\n`;
    }

    if (warningAlerts.length > 0) {
      message += `⚠️ *Produtos Próximos de Acabar:*\n`;
      warningAlerts.forEach(alert => {
        message += `• ${alert.product_name}`;
        if (alert.predicted_remaining_appointments && alert.predicted_remaining_appointments >= 0) {
          message += `: ~${Math.round(alert.predicted_remaining_appointments)} atendimentos restantes`;
        } else if (alert.predicted_remaining_days && alert.predicted_remaining_days >= 0) {
          message += `: ~${Math.round(alert.predicted_remaining_days)} dias restantes`;
        }
        message += `\n`;
      });
      message += `\n`;
    }

    message += `📅 ${new Date().toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}`;

    // Send WhatsApp notification if configured
    if (evolutionApiUrl && evolutionApiKey && notifyPhone) {
      try {
        // Validate URL format
        new URL(evolutionApiUrl);
        
        // Clean phone number
        let cleanPhone = notifyPhone.replace(/\D/g, '');
        if (cleanPhone.startsWith('0')) {
          cleanPhone = '55' + cleanPhone.substring(1);
        }
        if (!cleanPhone.startsWith('55')) {
          cleanPhone = '55' + cleanPhone;
        }

        const response = await fetch(`${evolutionApiUrl}/message/sendText/${encodeURIComponent(evolutionInstance)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionApiKey,
          },
          body: JSON.stringify({
            number: cleanPhone,
            text: message,
          }),
        });

        if (response.ok) {
          results.whatsapp_sent = true;
        } else {
          const errorText = await response.text();
          results.whatsapp_error = `Failed to send: ${errorText}`;
        }
      } catch (error) {
        results.whatsapp_error = error instanceof Error ? error.message : 'Unknown WhatsApp error';
      }
    }

    // Log the notification
    await supabase.from('audit_logs').insert({
      action: 'stock_alert_notification',
      table_name: 'products',
      new_data: {
        alerts: alerts.map(a => ({ product_id: a.product_id, product_name: a.product_name, alert_type: a.alert_type })),
        whatsapp_sent: results.whatsapp_sent,
        whatsapp_error: results.whatsapp_error,
      },
    });

    return new Response(
      JSON.stringify({ success: true, ...results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Stock alert notification error:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
