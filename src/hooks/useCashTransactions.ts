import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CashTransaction {
  id: string;
  cash_register_id: string | null;
  type: 'income' | 'expense';
  category: string;
  description: string | null;
  amount: number;
  payment_method: string | null;
  payment_method_name?: string;
  bank_id: string | null;
  bank?: { name: string } | null;
  reference_id: string | null;
  reference_type: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export function useCashTransactions(cashRegisterId?: string) {
  const queryClient = useQueryClient();

  const { data: transactions = [], isLoading, refetch } = useQuery({
    queryKey: ['cash_transactions', cashRegisterId],
    queryFn: async () => {
      let query = supabase
        .from('cash_transactions')
        .select(`
          *,
          bank:banks(name)
        `)
        .order('created_at', { ascending: false });

      if (cashRegisterId) {
        query = query.eq('cash_register_id', cashRegisterId);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Fetch payment methods to map IDs to names
      const { data: paymentMethods } = await supabase
        .from('payment_methods')
        .select('id, name');
      
      const paymentMethodMap = new Map(
        paymentMethods?.map(pm => [pm.id, pm.name]) || []
      );

      // Fetch services and packages to resolve names from IDs in description
      const { data: services } = await supabase
        .from('services')
        .select('id, name');
      const { data: packages } = await supabase
        .from('service_packages')
        .select('id, name');
      // Fetch single_sales to get proper description with service/package names
      const { data: sales } = await supabase
        .from('single_sales')
        .select('id, description, service_id, package_id');
      
      const serviceMap = new Map(services?.map(s => [s.id, s.name]) || []);
      const packageMap = new Map(packages?.map(p => [p.id, p.name]) || []);
      const salesMap = new Map(sales?.map(s => [s.id, {
        description: s.description,
        service_id: s.service_id,
        package_id: s.package_id
      }]) || []);
      
      // Map payment_method IDs to names and resolve service/package names in descriptions
      return (data || []).map(t => {
        let description = t.description || t.category;
        
        // If this is a sale reference, get proper name from the sale
        if (t.reference_type === 'single_sale' && t.reference_id) {
          const saleInfo = salesMap.get(t.reference_id);
          if (saleInfo) {
            if (saleInfo.service_id) {
              const serviceName = serviceMap.get(saleInfo.service_id);
              if (serviceName) {
                description = `Venda: ${serviceName}`;
              }
            } else if (saleInfo.package_id) {
              const packageName = packageMap.get(saleInfo.package_id);
              if (packageName) {
                description = `Venda: ${packageName}`;
              }
            } else if (saleInfo.description) {
              description = `Venda: ${saleInfo.description}`;
            }
          }
        }
        
        // Check if description contains a UUID (service or package ID) and replace with name
        if (t.reference_id && t.reference_type !== 'single_sale') {
          const serviceName = serviceMap.get(t.reference_id);
          const packageName = packageMap.get(t.reference_id);
          if (serviceName) {
            description = `Pagamento: ${serviceName}`;
          } else if (packageName) {
            description = `Pagamento: ${packageName}`;
          }
        }
        
        // Also try to extract UUID from description if reference_id is not set
        const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
        const uuidMatch = description?.match(uuidRegex);
        if (uuidMatch) {
          for (const uuid of uuidMatch) {
            const serviceName = serviceMap.get(uuid);
            const packageName = packageMap.get(uuid);
            if (serviceName) {
              description = description.replace(uuid, serviceName);
            } else if (packageName) {
              description = description.replace(uuid, packageName);
            }
          }
        }
        
        return {
          ...t,
          description,
          payment_method_name: t.payment_method ? paymentMethodMap.get(t.payment_method) || t.payment_method : null,
        };
      }) as CashTransaction[];
    },
  });

  const createTransaction = useMutation({
    mutationFn: async (transaction: Omit<CashTransaction, 'id' | 'created_at' | 'updated_at'>) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('cash_transactions')
        .insert({
          ...transaction,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Sync with financial_entries for tracking
      const financialType = transaction.type === 'income' ? 'receivable' : 'payable';
      const { error: entryError } = await supabase.from('financial_entries').insert({
        type: financialType,
        description: `Caixa: ${transaction.description || transaction.category}`,
        amount: transaction.amount,
        due_date: new Date().toISOString().split('T')[0],
        paid_date: new Date().toISOString().split('T')[0],
        status: 'paid',
        bank_id: transaction.bank_id,
        created_by: user?.id,
      });

      if (entryError) {
        console.error('Error syncing with financial_entries:', entryError);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
      queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
    },
    onError: (error: any) => {
      toast.error('Erro ao registrar transação: ' + error.message);
    },
  });

  const deleteTransaction = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('cash_transactions')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
      queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
    },
    onError: (error: any) => {
      toast.error('Erro ao excluir transação: ' + error.message);
    },
  });

  return {
    transactions,
    isLoading,
    refetch,
    createTransaction,
    deleteTransaction,
  };
}
