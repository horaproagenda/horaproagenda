import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { validateClientInput, normalizeClientInput, duplicateClientMessage } from "../_shared/clientRules.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ClientRequest {
  name: string;
  phone: string;
  email?: string;
  cpf?: string;
  cnpj?: string;
  company_name?: string;
  birthdate?: string;
  notes?: string;
  referral_source?: string;
  complementary_info?: string;
  assigned_professional_id?: string;
  cep?: string;
  address_street?: string;
  address_number?: string;
  address_complement?: string;
  address_neighborhood?: string;
  address_city?: string;
  address_state?: string;
  visibility?: string;
}

interface ValidationError {
  field: string;
  message: string;
}

// Helper function to check user role
async function checkUserRole(supabase: ReturnType<typeof createClient>, userId: string): Promise<{ hasPermission: boolean; roles: string[] }> {
  const { data: userRoles, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching user roles:', error);
    return { hasPermission: false, roles: [] };
  }

  const roles = userRoles?.map(r => r.role) || [];
  // Admin, receptionist, and professional can create clients
  const hasPermission = roles.includes('admin') || roles.includes('receptionist') || roles.includes('professional');
  
  return { hasPermission, roles };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - Missing token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getUser(token);
    if (claimsError || !claimsData?.user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.user.id;

    // SECURITY: Check role-based authorization
    const { hasPermission, roles } = await checkUserRole(supabase, userId);
    if (!hasPermission) {
      console.log(`User ${userId} with roles [${roles.join(', ')}] attempted client creation without permission`);
      return new Response(
        JSON.stringify({ success: false, error: 'Forbidden - Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`User ${userId} with roles [${roles.join(', ')}] authorized for client creation`);

    const body = await req.json() as ClientRequest;
    const errors: ValidationError[] = [];

    // Regras únicas de cadastro (mesmas da tela, do link e da importação)
    errors.push(...validateClientInput(body));

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({ success: false, errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Check for duplicate phone
    const row = normalizeClientInput(body);
    const cleanPhone = row.phone;
    const { data: existingByPhone } = await supabase
      .from('clients')
      .select('id, name')
      .eq('phone', cleanPhone)
      .maybeSingle();

    if (existingByPhone) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          errors: [{ field: 'phone', message: duplicateClientMessage('phone', existingByPhone.name) }],
          duplicate: existingByPhone
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Check for duplicate CPF if provided
    if (body.cpf) {
      const cleanCPF = body.cpf.replace(/\D/g, '');
      const { data: existingByCPF } = await supabase
        .from('clients')
        .select('id, name')
        .eq('cpf', cleanCPF)
        .maybeSingle();

      if (existingByCPF) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            errors: [{ field: 'cpf', message: duplicateClientMessage('cpf', existingByCPF.name) }],
            duplicate: existingByCPF
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 4b. Check for duplicate CNPJ if provided
    if (body.cnpj) {
      const cleanCNPJ = body.cnpj.replace(/\D/g, '');
      const { data: existingByCNPJ } = await supabase
        .from('clients')
        .select('id, name')
        .eq('cnpj', cleanCNPJ)
        .maybeSingle();

      if (existingByCNPJ) {
        return new Response(
          JSON.stringify({
            success: false,
            errors: [{ field: 'cnpj', message: duplicateClientMessage('cnpj', existingByCNPJ.name) }],
            duplicate: existingByCNPJ,
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 5. Verify professional exists if assigned
    if (body.assigned_professional_id) {
      const { data: professional, error: profError } = await supabase
        .from('professionals')
        .select('id, is_active')
        .eq('id', body.assigned_professional_id)
        .single();

      if (profError || !professional) {
        errors.push({ field: 'assigned_professional_id', message: 'Professional not found' });
      } else if (!professional.is_active) {
        errors.push({ field: 'assigned_professional_id', message: 'Professional is not active' });
      }

      if (errors.length > 0) {
        return new Response(
          JSON.stringify({ success: false, errors }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 5c. Visibilidade do cadastro: só admin ou quem tem a permissão
    // "Compartilhar" no módulo Clientes pode definir visibilidade ampla.
    // Sem permissão (ou sem o campo), enviamos null e o gatilho do banco
    // aplica o padrão privado.
    let visibility: string | null = null;
    const requestedVisibility = typeof body.visibility === 'string' ? body.visibility : null;
    if (requestedVisibility && ['private', 'shared', 'clinic'].includes(requestedVisibility)) {
      let canShare = roles.includes('admin');
      if (!canShare) {
        const { data: sharePerm, error: shareErr } = await supabase.rpc('has_permission', {
          _user_id: userId,
          _module: 'clientes',
          _action: 'share',
        });
        if (shareErr) {
          console.error('has_permission check failed:', shareErr);
        }
        canShare = sharePerm === true;
      }
      if (canShare) visibility = requestedVisibility;
    }

    // 6. Create the client
    const { data: client, error: insertError } = await supabase
      .from('clients')
      .insert({
        ...row,
        visibility,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create client', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: client }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Client creation error:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
