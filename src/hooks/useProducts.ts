import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type ProductType = 'solid' | 'liquid' | 'cream' | 'powder' | 'other';
export type ProductUnit = 'un' | 'ml' | 'l' | 'g' | 'kg';

export interface Product {
  id: string;
  name: string;
  description: string | null;
  brand: string | null;
  category: string | null;
  product_type: ProductType;
  unit: ProductUnit;
  quantity_purchased: number;
  unit_price: number;
  total_price: number;
  supplier: string | null;
  purchase_date: string | null;
  expiry_date: string | null;
  started_using_at: string | null;
  finished_at: string | null;
  current_stock: number;
  min_stock_alert: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface ProductPurchase {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  supplier: string | null;
  purchase_date: string;
  started_using_at: string | null;
  finished_at: string | null;
  duration_days: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  product?: Product;
}

export function useProducts() {
  const queryClient = useQueryClient();

  const { data: products = [], isLoading, refetch } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      return data as Product[];
    },
  });

  const createProduct = useMutation({
    mutationFn: async (product: Omit<Product, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'>) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('products')
        .insert({
          ...product,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Produto cadastrado com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao cadastrar produto: ' + error.message);
    },
  });

  const updateProduct = useMutation({
    mutationFn: async ({ id, ...product }: Partial<Product> & { id: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('products')
        .update({
          ...product,
          updated_by: user?.id,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Produto atualizado com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar produto: ' + error.message);
    },
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Produto excluído com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao excluir produto: ' + error.message);
    },
  });

  return {
    products,
    activeProducts: products.filter(p => p.is_active),
    inactiveProducts: products.filter(p => !p.is_active),
    isLoading,
    refetch,
    createProduct,
    updateProduct,
    deleteProduct,
  };
}

export function useProductPurchases(productId?: string) {
  const queryClient = useQueryClient();

  const { data: purchases = [], isLoading, refetch } = useQuery({
    queryKey: ['product_purchases', productId],
    queryFn: async () => {
      let query = supabase
        .from('product_purchases')
        .select('*, product:products(*)')
        .order('purchase_date', { ascending: false });

      if (productId) {
        query = query.eq('product_id', productId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as ProductPurchase[];
    },
  });

  const createPurchase = useMutation({
    mutationFn: async (purchase: Omit<ProductPurchase, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by' | 'duration_days' | 'product'>) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Create the purchase
      const { data, error } = await supabase
        .from('product_purchases')
        .insert({
          ...purchase,
          created_by: user?.id,
        })
        .select('*, product:products(*)')
        .single();

      if (error) throw error;

      // Get current open cash register
      const { data: openRegister } = await supabase
        .from('cash_registers')
        .select('id')
        .eq('status', 'open')
        .maybeSingle();

      // If there's an open register, create a cash transaction (expense)
      if (openRegister) {
        await supabase
          .from('cash_transactions')
          .insert({
            cash_register_id: openRegister.id,
            type: 'expense',
            category: 'product_purchase',
            description: `Compra: ${data.product?.name || 'Produto'}`,
            amount: purchase.total_price,
            reference_id: data.id,
            reference_type: 'product_purchase',
            created_by: user?.id,
          });
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product_purchases'] });
      queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      toast.success('Compra registrada com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao registrar compra: ' + error.message);
    },
  });

  const updatePurchase = useMutation({
    mutationFn: async ({ id, ...purchase }: Partial<ProductPurchase> & { id: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('product_purchases')
        .update({
          ...purchase,
          updated_by: user?.id,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product_purchases'] });
      toast.success('Compra atualizada com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar compra: ' + error.message);
    },
  });

  const deletePurchase = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('product_purchases')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product_purchases'] });
      toast.success('Compra excluída com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao excluir compra: ' + error.message);
    },
  });

  return {
    purchases,
    isLoading,
    refetch,
    createPurchase,
    updatePurchase,
    deletePurchase,
  };
}
