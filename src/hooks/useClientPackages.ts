import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
}

export interface PackageSession {
  id: string;
  package_id: string;
  session_number: number;
  status: string;
  appointment_id: string | null;
  scheduled_date: string | null;
}

export function useClientPackages(clientId: string | null) {
  const queryClient = useQueryClient();

  const { data: clientPackages = [], isLoading } = useQuery({
    queryKey: ['client_packages', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      
      const { data, error } = await supabase
        .from('service_packages')
        .select('*')
        .eq('client_id', clientId)
        .eq('is_active', true);
      
      if (error) throw error;
      return data as ClientPackage[];
    },
    enabled: !!clientId,
  });

  const getPackageRemainingSessions = (packageId: string) => {
    const pkg = clientPackages.find(p => p.id === packageId);
    if (!pkg) return { total: 0, scheduled: 0, remaining: 0 };
    
    return {
      total: pkg.total_sessions,
      scheduled: pkg.sessions_scheduled,
      remaining: pkg.total_sessions - pkg.sessions_scheduled,
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
      const { data: newPackage, error: packageError } = await supabase
        .from('service_packages')
        .insert({
          name: data.templateData.name,
          client_id: data.clientId,
          template_id: validTemplateId,
          total_sessions: data.templateData.total_sessions,
          duration: data.templateData.duration || 60,
          interval_days: data.templateData.interval_days || 7,
          total_price: data.templateData.total_price,
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

      // Create package_appointments for all sessions
      const sessions = Array.from({ length: data.templateData.total_sessions }, (_, i) => ({
        package_id: newPackage.id,
        session_number: i + 1,
        status: 'pending',
      }));

      const { error: sessionsError } = await supabase
        .from('package_appointments')
        .insert(sessions);

      if (sessionsError) throw sessionsError;

      return newPackage;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client_packages'] });
      queryClient.invalidateQueries({ queryKey: ['service_packages'] });
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
        .order('session_number', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!pendingSession) throw new Error('Não há sessões pendentes neste pacote');

      // Update the session with the appointment
      const { error: updateSessionError } = await supabase
        .from('package_appointments')
        .update({
          appointment_id: appointmentId,
          status: 'scheduled',
          scheduled_date: new Date().toISOString(),
        })
        .eq('id', pendingSession.id);

      if (updateSessionError) throw updateSessionError;

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

      return pendingSession;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client_packages'] });
      queryClient.invalidateQueries({ queryKey: ['service_packages'] });
      queryClient.invalidateQueries({ queryKey: ['package_appointments'] });
    },
  });

  return {
    clientPackages,
    isLoading,
    getPackageRemainingSessions,
    findClientPackageByTemplate,
    createClientPackage,
    incrementPackageSession,
  };
}
