import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regressão: quando as regras de acesso escondem o agendamento, o usuário não
 * pode mais receber a mensagem de "alterado por outro usuário". Profissional
 * sem cadastro vinculado recebe a mensagem de vínculo ausente; os demais
 * recebem mensagem de permissão.
 */

const state = {
  roles: ['professional'] as string[],
  linkedProfessionalId: null as string | null,
  appointmentCount: 0,
};

vi.mock('@/integrations/supabase/client', () => {
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } } }),
    },
    rpc: async () => ({ data: state.linkedProfessionalId, error: null }),
    from: (table: string) => ({
      select: () => ({
        eq: async () => {
          if (table === 'user_roles') {
            return { data: state.roles.map((role) => ({ role })), error: null };
          }
          return { count: state.appointmentCount, error: null };
        },
      }),
    }),
  };
  return { supabase: client };
});

vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import {
  resolveBlockedWriteError,
  AppointmentConflictError,
  AppointmentPermissionError,
  MissingProfessionalLinkError,
} from '../useAppointments';

describe('classificação do bloqueio ao salvar agendamento', () => {
  beforeEach(() => {
    state.roles = ['professional'];
    state.linkedProfessionalId = null;
    state.appointmentCount = 0;
  });

  it('avisa sobre vínculo ausente quando o profissional não tem cadastro', async () => {
    const error = await resolveBlockedWriteError('appointment-1');
    expect(error).toBeInstanceOf(MissingProfessionalLinkError);
    expect(error.message).toMatch(/cadastro de profissional/i);
    expect(error.message).not.toMatch(/alterado por outro/i);
  });

  it('avisa sobre permissão quando o registro não é visível para o usuário', async () => {
    state.linkedProfessionalId = 'prof-1';
    const error = await resolveBlockedWriteError('appointment-1');
    expect(error).toBeInstanceOf(AppointmentPermissionError);
    expect(error.message).toMatch(/permissão/i);
  });

  it('mantém a mensagem de concorrência para administradores', async () => {
    state.roles = ['admin'];
    const error = await resolveBlockedWriteError('appointment-1');
    expect(error).toBeInstanceOf(AppointmentConflictError);
    expect(error.message).toMatch(/alterado por outro/i);
  });
});
