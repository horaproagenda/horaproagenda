import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supaUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const supaAdmin = createClient(url, serviceKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: claims } = await supaUser.auth.getClaims(token);
    if (!claims?.claims?.sub) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const callerId = claims.claims.sub as string;

    const { data: roleRows } = await supaAdmin.from('user_roles').select('role').eq('user_id', callerId);
    const roles = (roleRows ?? []).map((r: any) => r.role);
    if (!roles.includes('admin')) {
      return new Response(JSON.stringify({ success: false, error: 'Apenas administradores podem cadastrar profissionais.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const {
      email, password, full_name,
      professional_id,
      payload,
      require_password_change, // boolean
      store_temp_password,     // boolean - admin opted to store the password in plain
    } = body;

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string' || password.length < 8) {
      return new Response(JSON.stringify({ success: false, error: 'E-mail e senha (mín. 8) são obrigatórios.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 1. Create or update auth user
    let userId: string | null = null;
    const { data: created, error: createErr } = await supaAdmin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: full_name || email },
    });
    if (createErr) {
      const msg = (createErr as any).message || '';
      if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered') || msg.toLowerCase().includes('exists')) {
        const { data: list } = await supaAdmin.auth.admin.listUsers();
        const existing = list?.users?.find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase());
        if (!existing) throw createErr;
        userId = existing.id;

        // Tenant isolation: only allow password reset if the existing user belongs to caller's account
        const { data: callerProfile } = await supaAdmin
          .from('profiles').select('account_owner_id').eq('id', callerId).maybeSingle();
        const ownerId = (callerProfile as any)?.account_owner_id ?? callerId;
        const { data: targetProfile } = await supaAdmin
          .from('profiles').select('account_owner_id').eq('id', userId).maybeSingle();
        const targetOwner = (targetProfile as any)?.account_owner_id ?? userId;
        if (!targetProfile || targetOwner !== ownerId) {
          return new Response(JSON.stringify({ success: false, error: 'E-mail já está em uso em outra conta.' }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Update password for existing user (same tenant only)
        await supaAdmin.auth.admin.updateUserById(userId, { password });
      } else { throw createErr; }
    } else {
      userId = created.user?.id ?? null;
    }
    if (!userId) throw new Error('Falha ao obter user id.');

    // 2. Insert/update professional record
    let profId = professional_id ?? null;
    if (!profId) {
      const insertPayload = { ...(payload || {}), email, name: payload?.name || full_name || email, user_id: userId };
      const { data: inserted, error: insErr } = await supaAdmin.from('professionals').insert(insertPayload).select('id').single();
      if (insErr) throw insErr;
      profId = inserted.id;
    } else {
      const { error: updErr } = await supaAdmin.from('professionals').update({ user_id: userId, email, ...(payload || {}) }).eq('id', profId);
      if (updErr) throw updErr;
    }

    // 3. Ensure professional role assigned
    const { data: existingRole } = await supaAdmin.from('user_roles').select('id').eq('user_id', userId).eq('role', 'professional').maybeSingle();
    if (!existingRole) {
      await supaAdmin.from('user_roles').insert({ user_id: userId, role: 'professional' });
    }

    // 4. Save credentials record (temp password + force-change flag)
    await supaAdmin.from('professional_credentials').upsert({
      professional_id: profId,
      user_id: userId,
      temp_password: store_temp_password ? password : null,
      must_change_password: !!require_password_change,
      set_at: new Date().toISOString(),
      set_by: callerId,
      password_changed_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'professional_id' });

    // 5. Audit log
    const { data: adminUser } = await supaAdmin.auth.admin.getUserById(callerId);
    await supaAdmin.from('audit_logs').insert({
      table_name: 'professionals',
      record_id: profId,
      action: professional_id ? 'ADMIN_UPDATE_PROFESSIONAL' : 'ADMIN_CREATE_PROFESSIONAL',
      new_data: {
        email, full_name, professional_id: profId, target_user_id: userId,
        require_password_change: !!require_password_change,
        password_stored: !!store_temp_password,
      },
      user_id: callerId,
      user_email: adminUser?.user?.email ?? null,
      ip_address: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? null,
    });

    return new Response(JSON.stringify({ success: true, user_id: userId, professional_id: profId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('admin-create-professional error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
