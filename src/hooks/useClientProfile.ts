import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Client, Appointment, ClientDocument, TreatmentPhoto, Quote, QuoteItem } from '@/types';

export function useClientProfile(clientId: string) {
  const queryClient = useQueryClient();

  // Fetch client details
  const { data: client, isLoading: clientLoading } = useQuery({
    queryKey: ['client', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .maybeSingle();

      if (error) throw error;
      return data as Client | null;
    },
    enabled: !!clientId,
  });

  // Fetch client appointments (including cancelled)
  const { data: appointments = [], isLoading: appointmentsLoading } = useQuery({
    queryKey: ['client-appointments', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          service:services(*)
        `)
        .eq('client_id', clientId)
        .order('start_time', { ascending: false });

      if (error) throw error;
      return data as Appointment[];
    },
    enabled: !!clientId,
  });

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

  // Calculate detailed stats
  const completedAppointments = appointments.filter(a => a.status === 'completed');
  const cancelledAppointments = appointments.filter(a => a.status === 'cancelled');
  const scheduledAppointments = appointments.filter(a => a.status === 'scheduled');
  const confirmedAppointments = appointments.filter(a => a.status === 'confirmed');
  
  // For now, we'll consider "missed" as appointments that were cancelled after the scheduled time
  // and "rescheduled" would require tracking appointment history (not currently available)
  const missedAppointments = 0; // Would need additional tracking
  const rescheduledAppointments = 0; // Would need additional tracking
  
  const totalRevenue = completedAppointments.reduce((sum, a) => sum + (a.service?.price || 0), 0);
  const proceduresCount = completedAppointments.length;

  return {
    client,
    appointments,
    documents,
    photos,
    quotes,
    isLoading: clientLoading || appointmentsLoading || documentsLoading || photosLoading || quotesLoading,
    updateClient,
    addDocument,
    addPhoto,
    addQuote,
    updateQuote,
    stats: {
      totalAppointments: appointments.length,
      completedAppointments: completedAppointments.length,
      cancelledAppointments: cancelledAppointments.length,
      missedAppointments,
      rescheduledAppointments,
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
