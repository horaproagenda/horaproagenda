import { afterAll, beforeAll, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authedClient, describeIfCreds, makeClient, tag } from './setup';

describeIfCreds('Public document submission and saved download', () => {
  let staff: SupabaseClient;
  const visitor = makeClient();
  let clientId: string;
  const templates: string[] = [];
  const links: string[] = [];
  const cpf = '52998224725';

  beforeAll(async () => {
    staff = await authedClient();
    const { data: user } = await staff.auth.getUser();
    if (!user.user) throw new Error('Test user unavailable');
    const { data: prof, error: profError } = await staff.from('professionals').select('id').eq('user_id', user.user.id).single();
    if (profError) throw profError;
    const { data, error } = await staff.from('clients').insert({
      name: tag('Documento CPF'), phone: `11${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
      cpf, assigned_professional_id: prof.id,
    }).select('id').single();
    if (error) throw error;
    clientId = data.id;
  });

  afterAll(async () => {
    if (!staff || !clientId) return;
    for (const id of links) {
      await staff.from('document_events').delete().eq('link_id', id);
      await staff.from('document_fill_links').delete().eq('id', id);
    }
    await staff.from('client_documents').delete().eq('client_id', clientId);
    for (const id of templates) await staff.from('document_templates').delete().eq('id', id);
    await staff.from('clients').delete().eq('id', clientId);
  });

  for (const category of ['anamnese', 'consent']) {
    it(`saves ${category} anonymously, with audit and CPF-gated persisted answers`, async () => {
      const { data: tpl, error: tplError } = await staff.from('document_templates').insert({
        title: tag(`Documento ${category}`), content: 'Resposta: [TEXTO_LIVRE]', category,
      }).select('id').single();
      expect(tplError).toBeNull();
      templates.push(tpl.id);
      const token = crypto.randomUUID().replaceAll('-', '');
      const { data: link, error: linkError } = await staff.from('document_fill_links').insert({
        template_id: tpl.id, client_id: clientId, token,
        template_snapshot: { fields: [{ field_id: 'answer', required: true }] },
      }).select('id').single();
      expect(linkError).toBeNull();
      links.push(link.id);
      const { data: publicLink } = await visitor.rpc('get_document_fill_link_by_token', { p_token: token });
      const args = { p_token: token, p_filled_content: 'Resposta: Não tenho alergias.', p_filled_variables: {},
        p_fields: [{ field_id: 'answer', value: 'Não tenho alergias.' }], p_template_version: publicLink.template_version, p_cpf: cpf };
      const denied = await visitor.rpc('submit_document_fill_validated', { ...args, p_cpf: '00000000000' });
      expect(denied.error?.message).toContain('CPF_MISMATCH');
      const { data: saved, error } = await visitor.rpc('submit_document_fill_validated', args);
      expect(error).toBeNull();
      expect(saved.ok).toBe(true);
      const repeat = await visitor.rpc('submit_document_fill_validated', { ...args, p_filled_content: 'Alteração indevida' });
      expect(repeat.error).toBeNull();
      expect(repeat.data.document_id).toBe(saved.document_id);
      const { data: docs, error: docError } = await staff.from('client_documents').select('id,content,type,signed_at,account_owner_id').eq('client_id', clientId).eq('template_id', tpl.id);
      expect(docError).toBeNull();
      expect(docs).toHaveLength(1);
      expect(docs?.[0].content).toBe(args.p_filled_content);
      expect(docs?.[0].type).toBe(category);
      expect(docs?.[0].signed_at).toBeNull();
      const { data: audit } = await staff.from('audit_logs').select('account_owner_id').eq('record_id', saved.document_id).eq('action', 'INSERT');
      expect(audit?.length).toBeGreaterThan(0);
      expect(audit?.[0].account_owner_id).toBe(docs?.[0].account_owner_id);
      const reopened = await visitor.rpc('get_document_fill_link_by_token', { p_token: token });
      expect(reopened.data.status).toBe('filled');
      expect(reopened.data.filled_content).toBeNull();
      const auth = await visitor.rpc('authenticate_document_fill_link', { p_token: token, p_cpf: cpf });
      expect(auth.error).toBeNull();
      expect(auth.data.filled_content).toBe(args.p_filled_content);
    });
  }
});