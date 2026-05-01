import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getPackageAvailabilitySummary, shouldShowPackageInSelector } from '@/lib/packageAvailability';

export interface ClientPackage {
  id: string;
  name: string;
  client_id: string;
  total_sessions: number;
  sessions_scheduled: number;
  duration: number;
  interval_days: number;
  professional_id: string | null;
  room_id: string | null;
  service_id: string | null;
  is_active: boolean;
  auto_schedule: boolean;
  preferred_day_of_week: number | null;
  preferred_time: string | null;
  template_id: string | null;
  total_price: number;
  equipment: string[];
  description: string | null;
  created_at: string;
  payment_methods?: string[] | null; // Indicates package was paid via caixa when set
  package_type?: 'standard' | 'sequential';
  steps?: Array<{ service_id?: string | null; sequence_order?: number; interval_after_days?: number }>;
  appointments?: PackageSession[];
}

export interface PackageSession {
  id: string;
  package_id: string;
  session_number: number;
  status: string;
  appointment_id: string | null;
  scheduled_date: string | null;
  service_id?: string | null;
  sequence_order?: number | null;
  interval_after_days?: number | null;
}

const getRemainingSessionCount = (pkg: Pick<ClientPackage, 'total_sessions' | 'sessions_scheduled' | 'appointments'>) => {
  return getPackageAvailabilitySummary(pkg).remainingSessions;
};

const getSchedulableSessionCount = (pkg: Pick<ClientPackage, 'total_sessions' | 'sessions_scheduled' | 'appointments'>) => {
  return getPackageAvailabilitySummary(pkg).schedulableSessions;
};

export function useClientPackages(clientId: string | null) {
  const queryClient = useQueryClient();

  // Subscribe to realtime changes for packages and appointments - both global and client-specific
  useEffect(() => {
    if (!clientId) return;

    const channel = supabase
      .channel(`client-packages-realtime-${clientId}`)
      // Listen to ALL service_packages changes (not just filtered) for faster detection
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'service_packages',
        },
        (payload) => {
          console.log('New package created, checking if for this client...', payload);
          // Check if it's for our client
          if (payload.new && (payload.new as any).client_id === clientId) {
            console.log('Package is for this client, refreshing immediately!');
            queryClient.invalidateQueries({ queryKey: ['client_packages', clientId], refetchType: 'all' });
            queryClient.invalidateQueries({ queryKey: ['client_packages'], refetchType: 'all' });
            queryClient.invalidateQueries({ queryKey: ['service_packages'], refetchType: 'all' });
            queryClient.invalidateQueries({ queryKey: ['appointments'], refetchType: 'all' });
            queryClient.refetchQueries({ queryKey: ['client_packages', clientId], type: 'active' });
            queryClient.refetchQueries({ queryKey: ['appointments'], type: 'active' });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'service_packages',
          filter: `client_id=eq.${clientId}`,
        },
        () => {
          console.log('Package update detected, refreshing...');
          queryClient.invalidateQueries({ queryKey: ['client_packages', clientId], refetchType: 'all' });
          queryClient.invalidateQueries({ queryKey: ['service_packages'], refetchType: 'all' });
          queryClient.invalidateQueries({ queryKey: ['appointments'], refetchType: 'all' });
          queryClient.refetchQueries({ queryKey: ['client_packages', clientId], type: 'active' });
          queryClient.refetchQueries({ queryKey: ['appointments'], type: 'active' });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'service_packages',
          filter: `client_id=eq.${clientId}`,
        },
        () => {
          console.log('Package delete detected, refreshing agenda and package lists...');
          queryClient.invalidateQueries({ queryKey: ['client_packages', clientId], refetchType: 'all' });
          queryClient.invalidateQueries({ queryKey: ['service_packages'], refetchType: 'all' });
          queryClient.invalidateQueries({ queryKey: ['appointments'], refetchType: 'all' });
          queryClient.refetchQueries({ queryKey: ['client_packages', clientId], type: 'active' });
          queryClient.refetchQueries({ queryKey: ['appointments'], type: 'active' });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'package_appointments',
        },
        () => {
          console.log('Package appointments update detected, refreshing...');
          queryClient.invalidateQueries({ queryKey: ['client_packages', clientId], refetchType: 'all' });
          queryClient.invalidateQueries({ queryKey: ['package_details'], refetchType: 'all' });
          queryClient.invalidateQueries({ queryKey: ['appointments'], refetchType: 'all' });
          queryClient.refetchQueries({ queryKey: ['client_packages', clientId], type: 'active' });
          queryClient.refetchQueries({ queryKey: ['appointments'], type: 'active' });
        }
      )
      .subscribe((status) => {
        console.log('Client packages realtime subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, queryClient]);

  const { data: clientPackages = [], isLoading, refetch } = useQuery({
    queryKey: ['client_packages', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      
      const { data, error } = await supabase
        .from('service_packages')
        .select(`
          *,
          appointments:package_appointments (*)
        `)
        .eq('client_id', clientId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching client packages:', error);
        throw error;
      }
      
      console.log('Client packages fetched:', data?.length, 'for client:', clientId);
      return (data || []).map((pkg: any) => ({
        ...pkg,
        appointments: (pkg.appointments || []).sort((a: any, b: any) => (a.sequence_order || a.session_number) - (b.sequence_order || b.session_number)),
      })) as ClientPackage[];
    },
    enabled: !!clientId,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // Filter packages with available sessions (for scheduling purposes)
  const availablePackages = clientPackages.filter(shouldShowPackageInSelector);

  const getPackageRemainingSessions = (packageId: string) => {
    const pkg = clientPackages.find(p => p.id === packageId);
    if (!pkg) return { total: 0, scheduled: 0, remaining: 0 };
    
    const remaining = getRemainingSessionCount(pkg);
    return {
      total: pkg.total_sessions,
      scheduled: pkg.total_sessions - remaining,
      remaining,
    };
  };

  const findClientPackageByTemplate = (templateId: string) => {
    return clientPackages.find(p => p.template_id === templateId);
  };

  const createClientPackage = useMutation({
    mutationFn: async (data: {
      clientId: string;
      templateId?: string | null;
      templateData: {
        name: string;
        total_sessions: number;
        duration: number;
        interval_days: number;
        total_price: number;
        package_type?: 'standard' | 'sequential';
        service_id?: string | null;
        steps?: Array<{ service_id?: string | null; sequence_order?: number; interval_after_days?: number }>;
        professional_id?: string | null;
        room_id?: string | null;
        equipment?: string[];
      };
      autoSchedule: boolean;
      preferredDayOfWeek?: number;
      preferredTime?: string;
    }) => {
      // If templateId is provided, verify it exists in package_templates
      // Otherwise, don't set template_id (it's optional)
      let validTemplateId: string | null = null;
      if (data.templateId) {
        const { data: existingTemplate } = await supabase
          .from('package_templates')
          .select('id')
          .eq('id', data.templateId)
          .maybeSingle();
        
        validTemplateId = existingTemplate ? data.templateId : null;
      }

      // Create the client-specific package
      const { data: newPackage, error: packageError } = await (supabase as any)
        .from('service_packages')
        .insert({
          name: data.templateData.name,
          client_id: data.clientId,
          template_id: validTemplateId,
          total_sessions: data.templateData.total_sessions,
          duration: data.templateData.duration || 60,
          interval_days: data.templateData.interval_days || 7,
          total_price: data.templateData.total_price,
          package_type: data.templateData.package_type || 'standard',
          service_id: data.templateData.service_id || null,
          professional_id: data.templateData.professional_id,
          room_id: data.templateData.room_id,
          equipment: data.templateData.equipment || [],
          auto_schedule: data.autoSchedule,
          preferred_day_of_week: data.preferredDayOfWeek,
          preferred_time: data.preferredTime,
          sessions_scheduled: 0,
          is_active: true,
        })
        .select()
        .single();

      if (packageError) throw packageError;

      // Create package_appointments for all sessions or sequential steps
      const templateSteps = data.templateData.package_type === 'sequential' && data.templateData.steps?.length
        ? data.templateData.steps
        : Array.from({ length: data.templateData.total_sessions }, (_, i) => ({
            service_id: data.templateData.service_id || null,
            interval_after_days: data.templateData.interval_days || 7,
            sequence_order: i + 1,
          }));

      const sessions = templateSteps.map((step: any, i: number) => ({
        package_id: newPackage.id,
        service_id: step.service_id || data.templateData.service_id || null,
        session_number: i + 1,
        original_session_number: i + 1,
        sequence_order: step.sequence_order || i + 1,
        interval_after_days: i === templateSteps.length - 1 ? 0 : step.interval_after_days || data.templateData.interval_days || 7,
        status: 'pending',
      }));

      const { error: sessionsError } = await (supabase as any)
        .from('package_appointments')
        .insert(sessions);

      if (sessionsError) throw sessionsError;

      return newPackage;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client_packages'] });
      queryClient.invalidateQueries({ queryKey: ['service_packages'] });
      queryClient.invalidateQueries({ queryKey: ['package_appointments'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client_credits'] });
      queryClient.invalidateQueries({ queryKey: ['clients_credits'] });
    },
    onError: (error) => {
      toast.error('Erro ao criar pacote do cliente: ' + error.message);
    },
  });

  const incrementPackageSession = useMutation({
    mutationFn: async ({ packageId, appointmentId }: { packageId: string; appointmentId: string }) => {
      // Get the next pending session
      const { data: pendingSession, error: fetchError } = await supabase
        .from('package_appointments')
        .select('*')
        .eq('package_id', packageId)
        .eq('status', 'pending')
        .order('sequence_order', { ascending: true })
        .order('session_number', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!pendingSession) throw new Error('Não há sessões pendentes neste pacote');

      const { data: appointmentSchedule } = await supabase
        .from('appointments')
        .select('start_time')
        .eq('id', appointmentId)
        .single();

      // Update the session with the appointment
      const { error: updateSessionError } = await supabase
        .from('package_appointments')
        .update({
          appointment_id: appointmentId,
          status: 'scheduled',
          scheduled_date: appointmentSchedule?.start_time || new Date().toISOString(),
        })
        .eq('id', pendingSession.id);

      if (updateSessionError) throw updateSessionError;

      // Get the package and current package-level payment state
      const { data: pkgData } = await supabase
        .from('service_packages')
        .select('payment_methods, total_sessions, total_price, name')
        .eq('id', packageId)
        .single();

      const { data: packagePaymentRows } = await supabase
        .from('package_appointments')
        .select('appointment:appointments(amount_paid, payment_methods)')
        .eq('package_id', packageId)
        .not('appointment_id', 'is', null);

      const packageAppointments = (packagePaymentRows || [])
        .map((row: any) => row.appointment)
        .filter(Boolean);
      const packageAmountPaid = Math.max(...packageAppointments.map((apt: any) => Number(apt.amount_paid || 0)), 0);
      const packagePaymentMethods = [...new Set([
        ...(pkgData?.payment_methods || []),
        ...packageAppointments.flatMap((apt: any) => Array.isArray(apt.payment_methods) ? apt.payment_methods : []),
      ])];
      const packageTotalPrice = Number(pkgData?.total_price || 0);
      const packagePaymentStatus = packageTotalPrice > 0 && packageAmountPaid >= packageTotalPrice
        ? 'paid'
        : packageAmountPaid > 0
          ? 'partial'
          : 'pending';
      const totalSessions = pkgData?.total_sessions || 1;
      const packageName = pkgData?.name || 'Pacote';

      // Get the current appointment notes to preserve any user notes
      const { data: currentAppointment } = await supabase
        .from('appointments')
        .select('notes')
        .eq('id', appointmentId)
        .single();

      // Build the session label with correct session number
      const sessionLabel = `${packageName} - Sessão ${pendingSession.session_number} de ${totalSessions}`;
      
      // Extract user notes if any (everything after the package name that's not a session label)
      let userNotes = '';
      if (currentAppointment?.notes) {
        // Remove any existing session label pattern to get only user notes
        const existingNotes = currentAppointment.notes;
        const sessionLabelPattern = new RegExp(`^${packageName}(\\s*-\\s*Sessão\\s*\\d+\\s*de\\s*\\d+)?\\s*(-\\s*)?`, 'i');
        userNotes = existingNotes.replace(sessionLabelPattern, '').trim();
      }

      // Combine session label with user notes
      const finalNotes = userNotes ? `${sessionLabel} - ${userNotes}` : sessionLabel;

      // Update the appointment to link to the package_appointment and update notes with correct session number
      const { error: appointmentError } = await supabase
        .from('appointments')
        .update({
          package_appointment_id: pendingSession.id,
          service_id: pendingSession.service_id || null,
          payment_status: packagePaymentStatus,
          amount_paid: packageAmountPaid,
          payment_methods: packagePaymentMethods,
          notes: finalNotes,
        })
        .eq('id', appointmentId);

      if (appointmentError) throw appointmentError;

      // Increment the sessions_scheduled counter
      const { data: pkg } = await supabase
        .from('service_packages')
        .select('sessions_scheduled')
        .eq('id', packageId)
        .single();

      await supabase
        .from('service_packages')
        .update({
          sessions_scheduled: (pkg?.sessions_scheduled || 0) + 1,
        })
        .eq('id', packageId);

      return { ...pendingSession, session_number: pendingSession.session_number, total_sessions: totalSessions };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client_packages'] });
      queryClient.invalidateQueries({ queryKey: ['service_packages'] });
      queryClient.invalidateQueries({ queryKey: ['package_appointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client-appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client_credits'] });
      queryClient.invalidateQueries({ queryKey: ['clients_credits'] });
    },
  });

  return {
    clientPackages,
    availablePackages,
    isLoading,
    refetch,
    getPackageRemainingSessions,
    getRemainingSessionCount,
    getSchedulableSessionCount,
    findClientPackageByTemplate,
    createClientPackage,
    incrementPackageSession,
  };
}
