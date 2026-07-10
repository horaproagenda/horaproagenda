import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CardBrandFee {
  id: string;
  card_brand_id: string;
  installment_number: number;
  fee_percentage: number;
  created_at: string;
  updated_at: string;
}

export interface CardBrand {
  id: string;
  name: string;
  type: 'credit' | 'debit' | 'both';
  is_active: boolean;
  fee_behavior: 'add_to_client' | 'deduct_from_provider';
  created_at: string;
  updated_at: string;
  fees?: CardBrandFee[];
}

export function useCardBrands() {
  const queryClient = useQueryClient();

  const { data: cardBrands = [], isLoading, refetch } = useQuery({
    queryKey: ['card_brands'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('card_brands')
        .select('*, fees:card_brand_fees(*)')
        .order('name');

      if (error) throw error;
      return data as CardBrand[];
    },
  });

  const createCardBrand = useMutation({
    mutationFn: async (brand: { name: string; type: string; is_active: boolean; fee_behavior?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('card_brands')
        .insert({
          ...brand,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['card_brands'] });
      toast.success('Bandeira criada com sucesso!');
    },
    onError: (error: any) => {
      if (error?.code === '23505' || String(error?.message || '').toLowerCase().includes('duplicate')) return;
      toast.error('Erro ao criar bandeira: ' + error.message);
    },
  });

  const updateCardBrand = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CardBrand> & { id: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('card_brands')
        .update({
          ...updates,
          updated_by: user?.id,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['card_brands'] });
      toast.success('Bandeira atualizada com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar bandeira: ' + error.message);
    },
  });

  const deleteCardBrand = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('card_brands')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['card_brands'] });
      toast.success('Bandeira excluída com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao excluir bandeira: ' + error.message);
    },
  });

  // Fee management
  const saveBrandFees = useMutation({
    mutationFn: async ({ brandId, fees }: { brandId: string; fees: { installment_number: number; fee_percentage: number }[] }) => {
      // Delete existing fees for this brand
      await supabase
        .from('card_brand_fees')
        .delete()
        .eq('card_brand_id', brandId);

      // Insert new fees
      if (fees.length > 0) {
        const { error } = await supabase
          .from('card_brand_fees')
          .insert(
            fees.map(f => ({
              card_brand_id: brandId,
              installment_number: f.installment_number,
              fee_percentage: f.fee_percentage,
            }))
          );

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['card_brands'] });
      toast.success('Taxas salvas com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao salvar taxas: ' + error.message);
    },
  });

  const activeCardBrands = cardBrands.filter(cb => cb.is_active);
  const creditBrands = activeCardBrands.filter(cb => cb.type === 'credit' || cb.type === 'both');
  const debitBrands = activeCardBrands.filter(cb => cb.type === 'debit' || cb.type === 'both');

  return {
    cardBrands,
    activeCardBrands,
    creditBrands,
    debitBrands,
    isLoading,
    refetch,
    createCardBrand,
    updateCardBrand,
    deleteCardBrand,
    saveBrandFees,
  };
}
