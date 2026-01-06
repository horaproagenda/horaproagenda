import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Client, Appointment, ClientDocument, TreatmentPhoto, Quote, QuoteItem } from '@/types';

// Interface for payment history items from multiple sources
interface PaymentHistoryItem {
  id: string;
  date: string;
  description: string;
  serviceName: string;
  amount: number;
  paymentMethod: string;
  source: 'appointment' | 'sale';
}

export function useClientProfile(clientId: string) {
  const queryClient = useQueryClient();

  // Real-time subscription for appointments and sales updates
  useEffect(() => {
    if (!clientId) return;

    console.log('Setting up realtime subscriptions for client:', clientId);

    // Subscribe to appointments changes
    const appointmentsChannel = supabase
      .channel(`client-appointments-realtime-${clientId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          console.log('Realtime appointment update received:', payload);
          // Invalidate and refetch appointments when changes occur
          queryClient.invalidateQueries({ queryKey: ['client-appointments', clientId] });
          queryClient.invalidateQueries({ queryKey: ['client-sales', clientId] });
        }
      )
      .subscribe((status) => {
        console.log('Appointments subscription status:', status);
      });

    // Subscribe to single_sales changes
    const salesChannel = supabase
      .channel(`client-sales-realtime-${clientId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'single_sales',
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          console.log('Realtime sales update received:', payload);
          // Invalidate and refetch sales when changes occur
          queryClient.invalidateQueries({ queryKey: ['client-sales', clientId] });
        }
      )
      .subscribe((status) => {
        console.log('Sales subscription status:', status);
      });

    // Subscribe to ALL appointments for this project (to catch new ones)
    const allAppointmentsChannel = supabase
      .channel(`all-appointments-realtime`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'appointments',
        },
        (payload) => {
          // Check if this appointment belongs to our client
          if (payload.new && (payload.new as { client_id?: string }).client_id === clientId) {
            console.log('New appointment for this client:', payload);
            queryClient.invalidateQueries({ queryKey: ['client-appointments', clientId] });
          }
        }
      )
      .subscribe();

    // Subscribe to ALL service_packages for this project (to catch new package sales)
    const allPackagesChannel = supabase
      .channel(`all-packages-realtime-for-profile-${clientId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'service_packages',
        },
        (payload) => {
          // Check if this package belongs to our client
          if (payload.new && (payload.new as { client_id?: string }).client_id === clientId) {
            console.log('New package for this client:', payload);
            queryClient.invalidateQueries({ queryKey: ['client_packages', clientId] });
            queryClient.invalidateQueries({ queryKey: ['client_packages'] });
            queryClient.invalidateQueries({ queryKey: ['service_packages'] });
            queryClient.invalidateQueries({ queryKey: ['client-sales', clientId] });
          }
        }
      )
      .subscribe((status) => {
        console.log('Packages subscription for profile status:', status);
      });

    return () => {
      console.log('Cleaning up realtime subscriptions');
      supabase.removeChannel(appointmentsChannel);
      supabase.removeChannel(salesChannel);
      supabase.removeChannel(allAppointmentsChannel);
      supabase.removeChannel(allPackagesChannel);
    };
  }, [clientId, queryClient]);

  // Fetch client details with assigned professional
  const { data: client, isLoading: clientLoading } = useQuery({
    queryKey: ['client', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select(`
          *,
          assigned_professional:professionals!clients_assigned_professional_id_fkey(id, name)
        `)
        .eq('id', clientId)
        .maybeSingle();

      if (error) throw error;
      return data as Client | null;
    },
    enabled: !!clientId,
    staleTime: 0, // Always refetch for latest data
  });

  // Fetch client appointments with full details
  const { data: appointments = [], isLoading: appointmentsLoading } = useQuery({
    queryKey: ['client-appointments', clientId],
    queryFn: async () => {
      console.log('Fetching appointments for client:', clientId);
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          service:services(*),
          package_appointment:package_appointments!appointments_package_appointment_id_fkey(*, package:service_packages(*))
        `)
        .eq('client_id', clientId)
        .order('start_time', { ascending: false });

      if (error) {
        console.error('Error fetching appointments:', error);
        throw error;
      }
      console.log('Appointments fetched:', data?.length);
      return data as Appointment[];
    },
    enabled: !!clientId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 30000, // Refetch every 30 seconds as fallback
  });

  // Fetch client sales from single_sales table (synced with caixa)
  const { data: clientSales = [], isLoading: salesLoading } = useQuery({
    queryKey: ['client-sales', clientId],
    queryFn: async () => {
      console.log('Fetching sales for client:', clientId);
      const { data, error } = await supabase
        .from('single_sales')
        .select(`
          *,
          service:services(name, price),
          package:service_packages(name, total_price),
          payment_method:payment_methods(id, name),
          bank:banks(name)
        `)
        .eq('client_id', clientId)
        .order('sale_date', { ascending: false });

      if (error) throw error;
      console.log('Sales fetched:', data?.length);
      return data || [];
    },
    enabled: !!clientId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 30000, // Refetch every 30 seconds as fallback
  });
  
  // Fetch payment methods for mapping IDs to names
  const { data: paymentMethodsData = [] } = useQuery({
    queryKey: ['payment_methods_for_client'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('id, name');
      if (error) throw error;
      return data || [];
    },
    staleTime: 60000,
  });
  
  const paymentMethodMap = useMemo(() => 
    new Map(paymentMethodsData.map(pm => [pm.id, pm.name])),
    [paymentMethodsData]
  );

  // Fetch client documents
  const { data: documents = [], isLoading: documentsLoading } = useQuery({
    queryKey: ['client-documents', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_documents')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ClientDocument[];
    },
    enabled: !!clientId,
  });

  // Fetch treatment photos
  const { data: photos = [], isLoading: photosLoading } = useQuery({
    queryKey: ['client-photos', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('treatment_photos')
        .select(`
          *,
          appointment:appointments(*, service:services(*))
        `)
        .eq('client_id', clientId)
        .order('taken_at', { ascending: false });

      if (error) throw error;
      return data as TreatmentPhoto[];
    },
    enabled: !!clientId,
  });

  // Fetch quotes
  const { data: quotes = [], isLoading: quotesLoading } = useQuery({
    queryKey: ['client-quotes', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map(quote => ({
        ...quote,
        items: (quote.items as unknown as QuoteItem[]) || [],
      })) as Quote[];
    },
    enabled: !!clientId,
  });

  // Update client
  const updateClient = useMutation({
    mutationFn: async (updates: Partial<Client>) => {
      const { data, error } = await supabase
        .from('clients')
        .update(updates)
        .eq('id', clientId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', clientId] });
      queryClient.invalidateQueries({ queryKey: ['clients'] }); // Sync with client list
      toast.success('Cliente atualizado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar cliente: ' + error.message);
    },
  });

  // Add document
  const addDocument = useMutation({
    mutationFn: async (doc: Omit<ClientDocument, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('client_documents')
        .insert(doc)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-documents', clientId] });
      toast.success('Documento adicionado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao adicionar documento: ' + error.message);
    },
  });

  // Add photo
  const addPhoto = useMutation({
    mutationFn: async (photo: Omit<TreatmentPhoto, 'id' | 'created_at' | 'appointment'>) => {
      const { data, error } = await supabase
        .from('treatment_photos')
        .insert(photo)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-photos', clientId] });
      toast.success('Foto adicionada com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao adicionar foto: ' + error.message);
    },
  });

  // Add quote
  const addQuote = useMutation({
    mutationFn: async (quote: Omit<Quote, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('quotes')
        .insert({
          client_id: quote.client_id,
          status: quote.status,
          items: JSON.parse(JSON.stringify(quote.items)),
          total_amount: quote.total_amount,
          notes: quote.notes,
          sent_via: quote.sent_via,
          sent_at: quote.sent_at,
          valid_until: quote.valid_until,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-quotes', clientId] });
      toast.success('Orçamento criado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao criar orçamento: ' + error.message);
    },
  });

  // Update quote
  const updateQuote = useMutation({
    mutationFn: async ({ id, items, ...updates }: Partial<Quote> & { id: string }) => {
      const updateData: Record<string, unknown> = { ...updates };
      if (items) {
        updateData.items = JSON.parse(JSON.stringify(items));
      }
      
      const { data, error } = await supabase
        .from('quotes')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-quotes', clientId] });
      toast.success('Orçamento atualizado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar orçamento: ' + error.message);
    },
  });

  // Calculate total revenue from BOTH appointments AND sales
  const totalFromAppointments = appointments
    .filter(a => a.payment_status === 'paid' || (a.amount_paid && a.amount_paid > 0))
    .reduce((sum, a) => sum + (a.amount_paid || 0), 0);

  const totalFromSales = clientSales.reduce((sum, sale) => sum + (sale.final_amount || 0), 0);

  // Deduplicate - if an appointment has a linked sale, don't count twice
  const appointmentSaleIds = new Set(
    appointments
      .filter(a => a.package_appointment?.package)
      .map(a => a.package_appointment?.package?.id)
  );
  
  const uniqueSalesTotal = clientSales
    .filter(sale => !sale.package_id || !appointmentSaleIds.has(sale.package_id))
    .reduce((sum, sale) => sum + (sale.final_amount || 0), 0);

  const totalRevenue = totalFromAppointments + uniqueSalesTotal;

  // Helper to get payment method name from ID
  const getPaymentMethodName = (methodIdOrName: string): string => {
    // Check if it's a UUID (payment method ID)
    if (methodIdOrName && methodIdOrName.includes('-') && methodIdOrName.length > 30) {
      return paymentMethodMap.get(methodIdOrName) || methodIdOrName;
    }
    return methodIdOrName;
  };

  // Build payment history from both sources - only actual payments with real amounts
  const paymentHistory: PaymentHistoryItem[] = [
    // From appointments with actual payments (not package appointments without direct payment)
    ...appointments
      .filter(a => {
        // Must have a real payment amount
        if (!a.amount_paid || a.amount_paid <= 0) return false;
        // Must have payment methods defined (indicates actual payment was made)
        if (!a.payment_methods || a.payment_methods.length === 0) return false;
        return true;
      })
      .map(a => ({
        id: a.id,
        date: a.start_time,
        description: a.service?.name || a.package_appointment?.package?.name || 'Serviço',
        serviceName: a.service?.name || a.package_appointment?.package?.name || '-',
        amount: a.amount_paid || 0,
        // Convert payment method IDs to names
        paymentMethod: a.payment_methods?.map(pm => getPaymentMethodName(pm)).join(', ') || '-',
        source: 'appointment' as const,
      })),
    // From sales (actual purchases through caixa)
    ...clientSales
      .filter(sale => sale.paid_at) // Only include if actually paid
      .map(sale => ({
        id: sale.id,
        date: sale.paid_at || sale.sale_date,
        description: sale.description || sale.service?.name || sale.package?.name || 'Venda',
        serviceName: sale.service?.name || sale.package?.name || '-',
        amount: sale.final_amount || 0,
        paymentMethod: sale.payment_method?.name || '-',
        source: 'sale' as const,
      })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Calculate detailed stats
  const completedAppointments = appointments.filter(a => a.status === 'completed');
  const cancelledAppointments = appointments.filter(a => a.status === 'cancelled');
  const missedAppointments = appointments.filter(a => a.status === 'missed');
  const rescheduledAppointments = appointments.filter(a => a.status === 'rescheduled');
  
  const proceduresCount = completedAppointments.length;

  // Manual refetch function
  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ['client', clientId] });
    queryClient.invalidateQueries({ queryKey: ['client-appointments', clientId] });
    queryClient.invalidateQueries({ queryKey: ['client-sales', clientId] });
    queryClient.invalidateQueries({ queryKey: ['client-documents', clientId] });
    queryClient.invalidateQueries({ queryKey: ['client-photos', clientId] });
    queryClient.invalidateQueries({ queryKey: ['client-quotes', clientId] });
  };

  return {
    client,
    appointments,
    documents,
    photos,
    quotes,
    clientSales,
    paymentHistory,
    isLoading: clientLoading || appointmentsLoading || documentsLoading || photosLoading || quotesLoading || salesLoading,
    updateClient,
    addDocument,
    addPhoto,
    addQuote,
    updateQuote,
    refetchAll,
    stats: {
      totalAppointments: appointments.length,
      completedAppointments: completedAppointments.length,
      cancelledAppointments: cancelledAppointments.length,
      missedAppointments: missedAppointments.length,
      rescheduledAppointments: rescheduledAppointments.length,
      totalRevenue,
      proceduresCount,
    },
  };
}

export function useUploadFile() {
  const uploadFile = async (file: File, path: string) => {
    const { data, error } = await supabase.storage
      .from('client-documents')
      .upload(path, file);

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('client-documents')
      .getPublicUrl(data.path);

    return { path: data.path, url: urlData.publicUrl };
  };

  return { uploadFile };
}
