import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
}

// CNPJ format validation (14 digits)
function validateCNPJFormat(cnpj: string): boolean {
  const clean = cnpj.replace(/\D/g, '');
  return clean.length === 14;
}


interface ValidationError {
  field: string;
  message: string;
}

// CPF validation function
function validateCPF(cpf: string): boolean {
  const cleanCPF = cpf.replace(/\D/g, '');
  
  if (cleanCPF.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cleanCPF)) return false;
  
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanCPF.charAt(i)) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.charAt(9))) return false;
  
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleanCPF.charAt(i)) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.charAt(10))) return false;
  
  return true;
}

// Email validation
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Phone validation (Brazilian format)
function validatePhone(phone: string): boolean {
  const cleanPhone = phone.replace(/\D/g, '');
  return cleanPhone.length >= 10 && cleanPhone.length <= 11;
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

    // 1. Required field validation
    if (!body.name || typeof body.name !== 'string' || body.name.trim().length < 2) {
      errors.push({ field: 'name', message: 'Name is required and must be at least 2 characters' });
    } else if (body.name.trim().length > 255) {
      errors.push({ field: 'name', message: 'Name must be less than 255 characters' });
    }

    if (!body.phone || typeof body.phone !== 'string') {
      errors.push({ field: 'phone', message: 'Phone is required' });
    } else if (!validatePhone(body.phone)) {
      errors.push({ field: 'phone', message: 'Invalid phone number format' });
    }

    // 2. Optional field validation
    if (body.email && !validateEmail(body.email)) {
      errors.push({ field: 'email', message: 'Invalid email format' });
    }

    if (body.cpf && !validateCPF(body.cpf)) {
      errors.push({ field: 'cpf', message: 'Invalid CPF' });
    }

    if (body.cnpj && !validateCNPJFormat(body.cnpj)) {
      errors.push({ field: 'cnpj', message: 'CNPJ must have 14 digits' });
    }

    if (body.cep) {
      const cepDigits = body.cep.replace(/\D/g, '');
      if (cepDigits.length !== 0 && cepDigits.length !== 8) {
        errors.push({ field: 'cep', message: 'CEP must have 8 digits' });
      }
    }

    if (body.address_state && body.address_state.length > 0 && body.address_state.length !== 2) {
      errors.push({ field: 'address_state', message: 'UF must be 2 characters' });
    }

    if (body.birthdate) {
      const birthDate = new Date(body.birthdate);
      if (isNaN(birthDate.getTime())) {
        errors.push({ field: 'birthdate', message: 'Invalid date format' });
      } else if (birthDate > new Date()) {
        errors.push({ field: 'birthdate', message: 'Birthdate cannot be in the future' });
      }
    }

    if (body.notes && body.notes.length > 5000) {
      errors.push({ field: 'notes', message: 'Notes must be less than 5000 characters' });
    }

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({ success: false, errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Check for duplicate phone
    const cleanPhone = body.phone.replace(/\D/g, '');
    const { data: existingByPhone } = await supabase
      .from('clients')
      .select('id, name')
      .eq('phone', cleanPhone)
      .maybeSingle();

    if (existingByPhone) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          errors: [{ field: 'phone', message: `Phone already registered to client: ${existingByPhone.name}` }],
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
            errors: [{ field: 'cpf', message: `CPF already registered to client: ${existingByCPF.name}` }],
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
            errors: [{ field: 'cnpj', message: `CNPJ already registered to client: ${existingByCNPJ.name}` }],
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

    // 6. Create the client
    const { data: client, error: insertError } = await supabase
      .from('clients')
      .insert({
        name: body.name.trim(),
        phone: cleanPhone,
        email: body.email?.trim() || null,
        cpf: body.cpf ? body.cpf.replace(/\D/g, '') : null,
        cnpj: body.cnpj ? body.cnpj.replace(/\D/g, '') : null,
        company_name: body.company_name?.trim() || null,
        birthdate: body.birthdate || null,
        notes: body.notes?.trim() || null,
        referral_source: body.referral_source?.trim() || null,
        complementary_info: body.complementary_info?.trim() || null,
        assigned_professional_id: body.assigned_professional_id || null,
        cep: body.cep ? body.cep.replace(/\D/g, '') : null,
        address_street: body.address_street?.trim() || null,
        address_number: body.address_number?.trim() || null,
        address_complement: body.address_complement?.trim() || null,
        address_neighborhood: body.address_neighborhood?.trim() || null,
        address_city: body.address_city?.trim() || null,
        address_state: body.address_state ? body.address_state.trim().toUpperCase() : null,
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
