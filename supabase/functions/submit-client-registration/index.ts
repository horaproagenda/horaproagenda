import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { validateClientInput, normalizeClientInput, duplicateClientMessage } from "../_shared/clientRules.ts";
import { inferDocumentType } from "../_shared/documentRules.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Regras únicas de cadastro (documento obrigatório no link público)
    const isPJ = body.person_type === 'pj';
    errors.push(...validateClientInput(body, { requireDocument: true }));
    const row = normalizeClientInput(body);

    if (errors.length) return new Response(JSON.stringify({ success: false, errors }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Duplicate checks — scoped to the link's tenant to avoid cross-tenant enumeration.
    const tenantOwner = (link as any).account_owner_id;
    const cleanPhone = row.phone;
    let phoneQ = admin.from('clients').select('id').eq('phone', cleanPhone);
    if (tenantOwner) phoneQ = phoneQ.eq('account_owner_id', tenantOwner);
    const { data: dupPhone } = await phoneQ.maybeSingle();
    if (dupPhone) return new Response(JSON.stringify({ success: false, error: duplicateClientMessage('phone') }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    if (!isPJ && body.cpf) {
      const cleanCpf = body.cpf.replace(/\D/g, '');
      let q = admin.from('clients').select('id').eq('cpf', cleanCpf);
      if (tenantOwner) q = q.eq('account_owner_id', tenantOwner);
      const { data: dup } = await q.maybeSingle();
      if (dup) return new Response(JSON.stringify({ success: false, error: duplicateClientMessage('cpf') }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (isPJ && body.cnpj) {
      const cleanCnpj = body.cnpj.replace(/\D/g, '');
      let q = admin.from('clients').select('id').eq('cnpj', cleanCnpj);
      if (tenantOwner) q = q.eq('account_owner_id', tenantOwner);
      const { data: dup } = await q.maybeSingle();
      if (dup) return new Response(JSON.stringify({ success: false, error: duplicateClientMessage('cnpj') }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Create client — explicitly set account_owner_id from the link's tenant
    // (service-role insert bypasses RLS, but the autofill trigger cannot infer
    // the tenant without auth.uid(), so we must provide it here).
    const { data: client, error: insErr } = await admin.from('clients').insert({
      ...row,
      complementary_info: null,
      assigned_professional_id: link.professional_id,
      account_owner_id: tenantOwner ?? null,
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
          const { data: tpl } = await admin.from('document_templates').select('id, title, category').eq('id', doc.template_id).maybeSingle();
          if (!tpl) continue;
          const docType = inferDocumentType((tpl as any).category, tpl.title);
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
            account_owner_id: tenantOwner ?? null,
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
