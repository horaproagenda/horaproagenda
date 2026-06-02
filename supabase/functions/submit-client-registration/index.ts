import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function validateCPF(cpf: string): boolean {
  const c = cpf.replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(c[i]) * (10 - i);
  let r = (s * 10) % 11; if (r >= 10) r = 0;
  if (r !== parseInt(c[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(c[i]) * (11 - i);
  r = (s * 10) % 11; if (r >= 10) r = 0;
  return r === parseInt(c[10]);
}

const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const validPhone = (p: string) => { const d = p.replace(/\D/g, ''); return d.length >= 10 && d.length <= 11; };
const UF = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

interface Payload {
  token: string;
  person_type: 'pf' | 'pj';
  name: string;
  phone: string;
  email?: string;
  cpf?: string;
  cnpj?: string;
  company_name?: string;
  birthdate?: string;
  referral_source?: string;
  notes?: string;
  cep?: string;
  address_street?: string;
  address_number?: string;
  address_complement?: string;
  address_neighborhood?: string;
  address_city?: string;
  address_state?: string;
  filled_documents?: Array<{
    template_id: string;
    content: string;
    variables: Record<string, unknown>;
    signed_by?: string;
  }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, serviceKey);

    const body = await req.json() as Payload;
    const errors: Array<{ field: string; message: string }> = [];

    if (!body.token) return new Response(JSON.stringify({ success: false, error: 'Token ausente' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Fetch link
    const { data: link, error: linkErr } = await admin
      .from('client_registration_links')
      .select('*')
      .eq('token', body.token)
      .maybeSingle();
    if (linkErr || !link) return new Response(JSON.stringify({ success: false, error: 'Link inválido' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return new Response(JSON.stringify({ success: false, error: 'Link expirado' }), { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (link.single_use && link.used_at) {
      return new Response(JSON.stringify({ success: false, error: 'Link já utilizado' }), { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Validate
    const isPJ = body.person_type === 'pj';
    if (!body.name || body.name.trim().length < 2) errors.push({ field: 'name', message: 'Nome obrigatório (mínimo 2 caracteres)' });
    if (!body.phone || !validPhone(body.phone)) errors.push({ field: 'phone', message: 'Telefone inválido' });
    if (body.email && !validEmail(body.email)) errors.push({ field: 'email', message: 'Email inválido' });

    if (isPJ) {
      const cnpjDigits = (body.cnpj || '').replace(/\D/g, '');
      if (cnpjDigits.length !== 14) errors.push({ field: 'cnpj', message: 'CNPJ deve ter 14 dígitos' });
    } else {
      if (!body.cpf || !validateCPF(body.cpf)) errors.push({ field: 'cpf', message: 'CPF inválido' });
    }

    if (body.cep) {
      const d = body.cep.replace(/\D/g, '');
      if (d.length !== 0 && d.length !== 8) errors.push({ field: 'cep', message: 'CEP deve ter 8 dígitos' });
    }
    if (body.address_state && !UF.includes(body.address_state.toUpperCase())) {
      errors.push({ field: 'address_state', message: 'UF inválida' });
    }
    if (body.birthdate) {
      const d = new Date(body.birthdate);
      if (isNaN(d.getTime()) || d > new Date()) errors.push({ field: 'birthdate', message: 'Data de nascimento inválida' });
    }

    if (errors.length) return new Response(JSON.stringify({ success: false, errors }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Duplicate checks
    const cleanPhone = body.phone.replace(/\D/g, '');
    const { data: dupPhone } = await admin.from('clients').select('id').eq('phone', cleanPhone).maybeSingle();
    if (dupPhone) return new Response(JSON.stringify({ success: false, error: 'Este telefone já está cadastrado no sistema.' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    if (!isPJ && body.cpf) {
      const cleanCpf = body.cpf.replace(/\D/g, '');
      const { data: dup } = await admin.from('clients').select('id').eq('cpf', cleanCpf).maybeSingle();
      if (dup) return new Response(JSON.stringify({ success: false, error: 'Este CPF já está cadastrado no sistema.' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (isPJ && body.cnpj) {
      const cleanCnpj = body.cnpj.replace(/\D/g, '');
      const { data: dup } = await admin.from('clients').select('id').eq('cnpj', cleanCnpj).maybeSingle();
      if (dup) return new Response(JSON.stringify({ success: false, error: 'Este CNPJ já está cadastrado no sistema.' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Create client
    const { data: client, error: insErr } = await admin.from('clients').insert({
      name: body.name.trim(),
      phone: cleanPhone,
      email: body.email?.trim() || null,
      cpf: !isPJ && body.cpf ? body.cpf.replace(/\D/g, '') : null,
      cnpj: isPJ && body.cnpj ? body.cnpj.replace(/\D/g, '') : null,
      company_name: isPJ ? (body.company_name?.trim() || null) : null,
      birthdate: !isPJ ? (body.birthdate || null) : null,
      notes: body.notes?.trim() || null,
      referral_source: body.referral_source?.trim() || null,
      assigned_professional_id: link.professional_id,
      cep: body.cep ? body.cep.replace(/\D/g, '') : null,
      address_street: body.address_street?.trim() || null,
      address_number: body.address_number?.trim() || null,
      address_complement: body.address_complement?.trim() || null,
      address_neighborhood: body.address_neighborhood?.trim() || null,
      address_city: body.address_city?.trim() || null,
      address_state: body.address_state ? body.address_state.toUpperCase() : null,
      is_active: true,
      registration_source: 'self_link',
    }).select().single();

    if (insErr) {
      console.error('Insert client error:', insErr);
      return new Response(JSON.stringify({ success: false, error: 'Falha ao criar cliente', details: insErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Filled documents
    if (body.filled_documents && body.filled_documents.length > 0) {
      for (const doc of body.filled_documents) {
        try {
          const { data: tpl } = await admin.from('document_templates').select('id, title').eq('id', doc.template_id).maybeSingle();
          if (!tpl) continue;
          const lowerTitle = (tpl.title || '').toLowerCase();
          const docType = lowerTitle.includes('anamnese') ? 'anamnese'
            : lowerTitle.includes('contrato') ? 'contract'
            : 'other';
          await admin.from('client_documents').insert({
            client_id: client.id,
            template_id: tpl.id,
            title: tpl.title,
            description: 'Preenchido no auto-cadastro em ' + new Date().toLocaleString('pt-BR'),
            type: docType,
            content: doc.content,
            filled_variables: doc.variables || {},
            signed_at: new Date().toISOString(),
            signed_by: doc.signed_by || body.name,
          });
        } catch (e) {
          console.error('Doc insert error', e);
        }
      }
    }

    // Mark used
    await admin.from('client_registration_links').update({
      used_at: new Date().toISOString(),
      created_client_id: client.id,
    }).eq('id', link.id);

    return new Response(JSON.stringify({ success: true, data: { id: client.id, name: client.name } }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    console.error('submit-client-registration error:', e);
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
