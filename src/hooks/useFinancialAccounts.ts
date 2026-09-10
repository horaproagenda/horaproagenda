import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAccountOwnerId } from '@/hooks/useAccountOwnerId';

export interface FinancialAccount {
  id: string;
  account_owner_id: string;
  professional_id: string | null;
  name: string;
  public_code: string | null;
  is_clinic: boolean;
  is_active: boolean;
}

export type MovementType = 'entrada' | 'saida' | 'transferencia' | 'estorno' | 'ajuste';

export interface FinancialMovement {
  id: string;
  financial_account_id: string;
  cash_session_id: string | null;
  professional_id: string | null;
  appointment_id: string | null;
  movement_type: MovementType;
  amount: number;
  category: string | null;
  payment_method: string | null;
  description: string | null;
  movement_date: string;
  created_by: string | null;
  status: 'pendente' | 'confirmado' | 'cancelado';
  transfer_group_id: string | null;
  counterpart_account_id: string | null;
  counterpart_movement_id: string | null;
}

/** Contas financeiras visíveis para o usuário: a da clínica e/ou a sua. */
export function useFinancialAccounts() {
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['financial_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_accounts')
        .select('*')
        .order('is_clinic', { ascending: false })
        .order('name');
      if (error) throw error;
      return data as FinancialAccount[];
    },
  });

  const clinicAccount = accounts.find((a) => a.is_clinic) ?? null;
  const ownAccounts = accounts.filter((a) => !a.is_clinic);

  return { accounts, clinicAccount, ownAccounts, isLoading };
}

/** Movimentações de uma conta financeira, com atualização em tempo real. */
export function useFinancialMovements(accountId?: string | null) {
  const queryClient = useQueryClient();
  const accountOwnerId = useAccountOwnerId();

  useEffect(() => {
    if (!accountOwnerId) return;
    const channel = supabase
      .channel(`financial_movements-${accountOwnerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_movements' }, () => {
        queryClient.invalidateQueries({ queryKey: ['financial_movements'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, accountOwnerId]);

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ['financial_movements', accountId ?? 'all'],
    queryFn: async () => {
      let query = supabase
        .from('financial_movements')
        .select('*')
        .order('movement_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (accountId) query = query.eq('financial_account_id', accountId);
      const { data, error } = await query;
      if (error) throw error;
      return data as FinancialMovement[];
    },
  });

  const createMovement = useMutation({
    mutationFn: async (input: {
      financial_account_id: string;
      movement_type: MovementType;
      amount: number;
      category?: string | null;
      payment_method?: string | null;
      description?: string | null;
      movement_date?: string;
      cash_session_id?: string | null;
      professional_id?: string | null;
      appointment_id?: string | null;
      counterpart_account_id?: string | null;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!accountOwnerId) throw new Error('Conta não identificada.');
      const { data, error } = await supabase
        .from('financial_movements')
        .insert({ ...input, account_owner_id: accountOwnerId, created_by: auth.user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as FinancialMovement;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial_movements'] });
      toast.success('Movimentação registrada!');
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Não foi possível registrar a movimentação.');
    },
  });

  /**
   * Transferência entre contas: o banco cria automaticamente o par de
   * lançamentos vinculados (saída na origem, entrada no destino).
   */
  const transfer = useMutation({
    mutationFn: async (input: {
      from_account_id: string;
      to_account_id: string;
      amount: number;
      description?: string | null;
      movement_date?: string;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('financial_movements')
        .insert({
          financial_account_id: input.from_account_id,
          counterpart_account_id: input.to_account_id,
          movement_type: 'transferencia',
          amount: input.amount,
          description: input.description ?? 'Transferência entre contas',
          movement_date: input.movement_date,
          created_by: auth.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as FinancialMovement;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial_movements'] });
      toast.success('Transferência registrada nas duas contas!');
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Não foi possível concluir a transferência.');
    },
  });

  return { movements, isLoading, createMovement, transfer };
}
