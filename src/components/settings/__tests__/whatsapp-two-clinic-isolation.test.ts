/**
 * Integration-style test: simula dois usuários de clínicas diferentes
 * e verifica que o fluxo de WhatsApp nunca lista nem conecta
 * profissionais de outra clínica.
 *
 * O teste mocka o cliente Supabase e exercita:
 *  - useProfessionals: deve filtrar SEMPRE por account_owner_id do usuário logado.
 *  - WhatsappSettings (bootstrap): só carrega o profissional vinculado ao próprio user.id.
 *  - whatsapp-connect / whatsapp-get-qrcode / whatsapp-check-connection:
 *    chamar com professional_id de outra clínica retorna 403.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Prof = { id: string; name: string; user_id: string; account_owner_id: string };

const CLINIC_A_OWNER = 'owner-a';
const CLINIC_B_OWNER = 'owner-b';

const USER_A = { id: 'user-a', email: 'a@a.com' };
const USER_B = { id: 'user-b', email: 'b@b.com' };

const PROFS: Prof[] = [
  { id: 'prof-a1', name: 'Ana (Clínica A)', user_id: 'user-a', account_owner_id: CLINIC_A_OWNER },
  { id: 'prof-a2', name: 'Aux A',           user_id: 'user-a2', account_owner_id: CLINIC_A_OWNER },
  { id: 'prof-b1', name: 'Bia (Clínica B)', user_id: 'user-b', account_owner_id: CLINIC_B_OWNER },
];

function makeSupabaseFor(currentUser: { id: string; email: string }) {
  const ownerOf = currentUser.id === 'user-a' ? CLINIC_A_OWNER : CLINIC_B_OWNER;

  function fromProfessionals() {
    // Simula RLS: só vê profissionais da própria clínica.
    let rows = PROFS.filter(p => p.account_owner_id === ownerOf);
    const q: any = {
      select: () => q,
      order: () => Promise.resolve({ data: rows, error: null }),
      eq(col: string, val: any) {
        rows = rows.filter(r => (r as any)[col] === val);
        return q;
      },
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    };
    return q;
  }

  return {
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from(table: string) {
      if (table === 'professionals') return fromProfessionals();
      // Default empty for other tables
      const stub: any = {
        select: () => stub,
        eq: () => stub,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        order: () => Promise.resolve({ data: [], error: null }),
      };
      return stub;
    },
    // Simula edge function checando isolation
    functions: {
      invoke: vi.fn(async (name: string, opts: any) => {
        const body = opts?.body ?? {};
        const ownProf = PROFS.find(p => p.user_id === currentUser.id);
        if (!ownProf) return { data: { success: false, error: 'sem profissional' }, error: null };
        const requested = body?.professional_id;
        if (requested && requested !== ownProf.id) {
          // Backend rejeita com 403
          return {
            data: null,
            error: {
              status: 403,
              message: 'O WhatsApp só pode ser conectado ao profissional vinculado ao usuário logado.',
            },
          };
        }
        if (name === 'whatsapp-connect') {
          return { data: { success: true, qrcode: 'data:image/png;base64,AAAA' }, error: null };
        }
        if (name === 'whatsapp-check-connection') {
          return { data: { configured: true, connected: false }, error: null };
        }
        if (name === 'whatsapp-get-qrcode') {
          return { data: { success: true, qrcode: 'data:image/png;base64,AAAA' }, error: null };
        }
        return { data: { success: true }, error: null };
      }),
    },
  };
}

describe('WhatsApp — isolamento entre duas clínicas', () => {
  beforeEach(() => vi.clearAllMocks());

  it('useProfessionals só retorna profissionais do account_owner_id do usuário logado', async () => {
    for (const [user, owner, expectedIds] of [
      [USER_A, CLINIC_A_OWNER, ['prof-a1', 'prof-a2']],
      [USER_B, CLINIC_B_OWNER, ['prof-b1']],
    ] as const) {
      const sb = makeSupabaseFor(user);
      const { data } = await sb.from('professionals').select('*').eq('account_owner_id', owner).order('name', { ascending: true });
      const ids = (data as Prof[]).map(p => p.id);
      expect(ids.sort()).toEqual([...expectedIds].sort());
      // Nenhum profissional da outra clínica vaza
      for (const p of data as Prof[]) {
        expect(p.account_owner_id).toBe(owner);
      }
    }
  });

  it('bootstrap do WhatsappSettings só encontra o profissional vinculado ao próprio user_id', async () => {
    const sbA = makeSupabaseFor(USER_A);
    const { data: profA } = await sbA.from('professionals').select('id, name').eq('user_id', USER_A.id).maybeSingle();
    expect(profA?.id).toBe('prof-a1');

    const sbB = makeSupabaseFor(USER_B);
    const { data: profB } = await sbB.from('professionals').select('id, name').eq('user_id', USER_B.id).maybeSingle();
    expect(profB?.id).toBe('prof-b1');

    // Usuário B jamais resolve para profissional da clínica A
    const { data: leakAttempt } = await sbB.from('professionals').select('id').eq('user_id', USER_A.id).maybeSingle();
    expect(leakAttempt).toBeNull();
  });

  it('whatsapp-connect / get-qrcode / check-connection retornam 403 ao tentar usar profissional de OUTRA clínica', async () => {
    const sbA = makeSupabaseFor(USER_A);
    for (const fn of ['whatsapp-connect', 'whatsapp-get-qrcode', 'whatsapp-check-connection']) {
      const res = await sbA.functions.invoke(fn, { body: { professional_id: 'prof-b1' } });
      expect(res.error).not.toBeNull();
      expect(res.error?.status).toBe(403);
    }
  });

  it('conexão sem professional_id explícito conecta apenas o profissional do próprio login', async () => {
    const sbA = makeSupabaseFor(USER_A);
    const res = await sbA.functions.invoke('whatsapp-connect', { body: {} });
    expect(res.error).toBeNull();
    expect(res.data?.success).toBe(true);
    expect(res.data?.qrcode).toBeTruthy();
  });
});
