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
  totalPrice: number;
  pendingAmount: number;
  paymentMethod: string;
  source: 'appointment' | 'sale';
  status: 'paid' | 'partial' | 'pending' | 'cancelled';
  saleId?: string;
  packageId?: string;
  serviceId?: string;
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

    // Subscribe to ALL service_packages events for this client (INSERT/UPDATE/DELETE)
    const allPackagesChannel = supabase
      .channel(`all-packages-realtime-for-profile-${clientId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_packages',
        },
        (payload) => {
          const row = (payload.new || payload.old) as { client_id?: string } | null;
          if (row && row.client_id === clientId) {
            console.log('Package change for this client:', payload);
            queryClient.invalidateQueries({ queryKey: ['client_packages', clientId] });
            queryClient.invalidateQueries({ queryKey: ['client_packages'] });
            queryClient.invalidateQueries({ queryKey: ['client_packages_with_counts', clientId] });
            queryClient.invalidateQueries({ queryKey: ['service_packages'] });
            queryClient.invalidateQueries({ queryKey: ['client-sales', clientId] });
            queryClient.invalidateQueries({ queryKey: ['client_credits', clientId] });
          }
        }
      )
      .subscribe((status) => {
        console.log('Packages subscription for profile status:', status);
      });

    // Subscribe to client_services for this client (paid services availability)
    const clientServicesChannel = supabase
      .channel(`client-services-realtime-${clientId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_services',
          filter: `client_id=eq.${clientId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['client_services', clientId] });
          queryClient.invalidateQueries({ queryKey: ['client_credits', clientId] });
          queryClient.invalidateQueries({ queryKey: ['client-sales', clientId] });
        }
      )
      .subscribe();

    // Subscribe to client_credit_transactions for this client
    const creditTransactionsChannel = supabase
      .channel(`client-credit-transactions-realtime-${clientId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_credit_transactions',
          filter: `client_id=eq.${clientId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['client_credit_transactions', clientId] });
          queryClient.invalidateQueries({ queryKey: ['client', clientId] });
          queryClient.invalidateQueries({ queryKey: ['clients'] });
        }
      )
      .subscribe();

    // Subscribe to payments_audit for this client (registered payments)
    const paymentsAuditChannel = supabase
      .channel(`client-payments-audit-realtime-${clientId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments_audit',
          filter: `client_id=eq.${clientId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['client-sales', clientId] });
          queryClient.invalidateQueries({ queryKey: ['client-appointments', clientId] });
          queryClient.invalidateQueries({ queryKey: ['client_credit_transactions', clientId] });
        }
      )
      .subscribe();

    // Subscribe to cash_register_entries for this client (cash flow)
    const cashEntriesChannel = supabase
      .channel(`client-cash-entries-realtime-${clientId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cash_register_entries',
          filter: `client_id=eq.${clientId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['client-sales', clientId] });
          queryClient.invalidateQueries({ queryKey: ['client_credit_transactions', clientId] });
        }
      )
      .subscribe();

    // Subscribe to financial_entries for this client
    const financialEntriesChannel = supabase
      .channel(`client-financial-entries-realtime-${clientId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'financial_entries',
          filter: `client_id=eq.${clientId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['client-sales', clientId] });
          queryClient.invalidateQueries({ queryKey: ['client_credit_transactions', clientId] });
        }
      )
      .subscribe();

    // Subscribe to package_appointments to refresh package usage counts
    const packageAppointmentsChannel = supabase
      .channel(`client-package-appointments-realtime-${clientId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'package_appointments' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['client_packages_with_counts', clientId] });
          queryClient.invalidateQueries({ queryKey: ['package_details'] });
          queryClient.invalidateQueries({ queryKey: ['client_credits', clientId] });
        }
      )
      .subscribe();

    // Subscribe to client_documents changes (to catch fill-link submissions)
    const documentsChannel = supabase
      .channel(`client-documents-realtime-${clientId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_documents',
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          console.log('Realtime document update received:', payload);
          queryClient.invalidateQueries({ queryKey: ['client-documents', clientId] });
        }
      )
      .subscribe();

    const photosChannel = supabase
      .channel(`client-photos-realtime-${clientId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'treatment_photos',
          filter: `client_id=eq.${clientId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['client-photos', clientId] });
          queryClient.refetchQueries({ queryKey: ['client-photos', clientId], type: 'active' });
        }
      )
      .subscribe();

    // Subscribe to boleto installment changes — refresh sales (which embed boletos)
    const boletoChannel = supabase
      .channel(`client-boleto-realtime-${clientId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'boleto_installments' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['client-sales', clientId] });
          queryClient.refetchQueries({ queryKey: ['client-sales', clientId], type: 'active' });
        }
      )
      .subscribe();

    return () => {
      console.log('Cleaning up realtime subscriptions');
      supabase.removeChannel(appointmentsChannel);
      supabase.removeChannel(salesChannel);
      supabase.removeChannel(allAppointmentsChannel);
      supabase.removeChannel(allPackagesChannel);
      supabase.removeChannel(clientServicesChannel);
      supabase.removeChannel(creditTransactionsChannel);
      supabase.removeChannel(paymentsAuditChannel);
      supabase.removeChannel(cashEntriesChannel);
      supabase.removeChannel(financialEntriesChannel);
      supabase.removeChannel(packageAppointmentsChannel);
      supabase.removeChannel(documentsChannel);
      supabase.removeChannel(photosChannel);
      supabase.removeChannel(boletoChannel);
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
      return data as unknown as Client | null;
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
          professional:professionals(*),
          room:rooms(*),
          package_appointment:package_appointments!appointments_package_appointment_id_fkey(
            *,
            package:service_packages(*, professional:professionals(*), room:rooms(*), service:services(*))
          )
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
          bank:banks(name),
          boleto_installments(*)
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
    staleTime: 0,
    refetchOnWindowFocus: true,
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
        .insert(doc as any)
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

  // Build payment history only from payments that were effectively registered.
  // Pending purchases/parcelas are intentionally excluded from this customer-facing history.
  const saleLinkedServiceIds = new Set<string>();
  clientSales.forEach(sale => {
    if (sale.service_id) saleLinkedServiceIds.add(sale.service_id);
  });

  const paymentHistory: PaymentHistoryItem[] = [
    ...clientSales.flatMap(sale => {
      const isCancelled = sale.notes?.includes('CANCELADO') || sale.final_amount === 0;
      if (isCancelled) return [];

      const serviceName = sale.service?.name || sale.package?.name || sale.description || '-';
      const totalPrice = Number(
        sale.original_amount != null && sale.original_amount !== 0
          ? sale.original_amount
          : sale.package?.total_price != null && sale.package.total_price !== 0
            ? sale.package.total_price
            : sale.service?.price != null && sale.service.price !== 0
              ? sale.service.price
              : sale.final_amount || 0
      );
      const basePayment = sale.paid_at
        ? [{
            id: sale.id,
            date: sale.paid_at.split('T')[0] || sale.sale_date || sale.created_at.split('T')[0],
            amount: Number(sale.final_amount || 0),
            paymentMethod: sale.payment_method?.name || '-',
            suffix: '',
          }]
        : [];

      // Active installments: exclude cancelled ones; renumber sequentially
      const activeInstallments = ((sale as any).boleto_installments || [])
        .filter((i: any) => i.status !== 'cancelled')
        .sort((a: any, b: any) => a.installment_number - b.installment_number);
      const activeTotal = activeInstallments.length;

      const boletoPayments = activeInstallments
        .map((installment: any, idx: number) => ({ installment, activeIdx: idx + 1 }))
        .filter(({ installment }) => installment.status === 'paid' && installment.paid_date)
        .map(({ installment, activeIdx }) => ({
          id: `${sale.id}-boleto-${installment.id}`,
          date: installment.paid_date,
          amount: Number(installment.amount || 0),
          paymentMethod: `Boleto ${activeIdx}/${activeTotal}`,
          suffix: ` - Parcela ${activeIdx}/${activeTotal}`,
        }));

      return [...basePayment, ...boletoPayments]
        .filter(payment => payment.amount > 0)
        .map(payment => ({
          id: payment.id,
          date: payment.date,
          description: `${serviceName}${payment.suffix}`,
          serviceName,
          amount: payment.amount,
          totalPrice,
          pendingAmount: Math.max(0, totalPrice - payment.amount),
          paymentMethod: payment.paymentMethod,
          source: 'sale' as const,
          status: 'paid' as const,
          saleId: sale.id,
          serviceId: sale.service_id || undefined,
          packageId: sale.package_id || undefined,
        }));
    }),
    ...(() => {
      // Deduplicate package appointments — each package's payment should appear only once,
      // not once per session, since amount_paid is propagated across all sessions.
      const seenPackageIds = new Set<string>();
      const items: PaymentHistoryItem[] = [];

      for (const a of appointments) {
        if (a.service_id && saleLinkedServiceIds.has(a.service_id)) continue;
        if ((a.amount_paid || 0) <= 0) continue;

        const pkg = a.package_appointment?.package;
        const packageId = pkg?.id;

        if (packageId) {
          if (seenPackageIds.has(packageId)) continue;
          // Skip if there is already a sale registered for this package
          if (appointmentSaleIds.has(packageId)) continue;
          seenPackageIds.add(packageId);
        }

        const servicePrice = Number(a.service?.price || 0);
        const packagePrice = Number(pkg?.total_price || 0);
        const totalPrice = packageId ? packagePrice : servicePrice;
        const amountPaid = Number(a.amount_paid || 0);
        const paymentMethodNames = (a.payment_methods || [])
          .map(m => getPaymentMethodName(m))
          .filter(Boolean)
          .join(', ');
        const displayName = packageId
          ? (pkg?.name || 'Pacote')
          : (a.service?.name || 'Atendimento');

        items.push({
          id: packageId ? `pkg-${packageId}` : `apt-${a.id}`,
          date: a.updated_at?.split('T')[0] || a.start_time.split('T')[0],
          description: displayName,
          serviceName: displayName,
          amount: amountPaid,
          totalPrice,
          pendingAmount: Math.max(0, totalPrice - amountPaid),
          paymentMethod: paymentMethodNames || '-',
          source: 'appointment' as const,
          status: 'paid' as const,
          packageId: packageId || undefined,
        });
      }

      return items;
    })(),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Calculate detailed stats - include confirmed in scheduled count
  const scheduledAppointments = appointments.filter(a => a.status === 'scheduled' || a.status === 'confirmed');
  const completedAppointments = appointments.filter(a => a.status === 'completed');
  const cancelledAppointments = appointments.filter(a => a.status === 'cancelled');
  const missedAppointments = appointments.filter(a => a.status === 'missed');
  const rescheduledAppointments = appointments.filter(a => a.status === 'rescheduled');
  
  const proceduresCount = completedAppointments.length;

  // Manual refetch function - comprehensive refresh
  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ['client', clientId] });
    queryClient.invalidateQueries({ queryKey: ['client-appointments', clientId] });
    queryClient.invalidateQueries({ queryKey: ['client-sales', clientId] });
    queryClient.invalidateQueries({ queryKey: ['client-documents', clientId] });
    queryClient.invalidateQueries({ queryKey: ['client-photos', clientId] });
    queryClient.invalidateQueries({ queryKey: ['client-quotes', clientId] });
    queryClient.invalidateQueries({ queryKey: ['client_packages', clientId] });
    queryClient.invalidateQueries({ queryKey: ['client_services', clientId] });
    queryClient.invalidateQueries({ queryKey: ['package_details'] });
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
      scheduledAppointments: scheduledAppointments.length,
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
    // Use client-photos bucket for photos (private bucket with signed URLs)
    const bucketName = path.includes('/photos/') ? 'client-photos' : 'client-documents';
    
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(path, file);

    if (error) throw error;

    // For private buckets, use signed URLs instead of public URLs
    // Signed URL valid for 30 minutes (1800 seconds)
    const { data: urlData, error: urlError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(data.path, 1800);

    if (urlError) throw urlError;

    return { path: data.path, url: urlData.signedUrl };
  };

  return { uploadFile };
}
