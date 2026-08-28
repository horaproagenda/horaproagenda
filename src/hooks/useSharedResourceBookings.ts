import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface SharedResourceBooking {
  id: string;
  resource_type: 'room' | 'equipment';
  resource_id: string | null;
  resource_name: string | null;
  start_time: string;
  end_time: string;
  status: string | null;
  client_name: string | null;
  service_name: string | null;
  professional_name: string | null;
  amount: number | null;
  notes: string | null;
}

/**
 * Reservas de OUTROS profissionais em recursos compartilhados da clínica
 * (salas e equipamentos).
 *
 * O servidor (`public.get_shared_resource_bookings`) só responde quando o
 * profissional tem a opção "Ver agenda de outros profissionais" ativada
 * (ou é administração/recepção) e mascara cliente, serviço, valor e
 * observações, liberando cada item apenas se o Administrador autorizar.
 */
export function useSharedResourceBookings(
  from: Date | string,
  to: Date | string,
  enabled = true,
) {
  const { user } = useAuth();
  const fromISO = typeof from === 'string' ? from : from.toISOString();
  const toISO = typeof to === 'string' ? to : to.toISOString();

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['shared-resource-bookings', user?.id, fromISO, toISO],
    queryFn: async (): Promise<SharedResourceBooking[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('get_shared_resource_bookings', {
        _from: fromISO,
        _to: toISO,
      });
      if (error) {
        console.warn('get_shared_resource_bookings:', error);
        return [];
      }
      return (data ?? []) as SharedResourceBooking[];
    },
    enabled: enabled && !!user?.id,
    staleTime: 15_000,
  });

  return { bookings: data, isLoading, refetch };
}

/** Rótulo seguro para exibir na agenda quando o atendimento é de outro profissional. */
export function sharedResourceLabel(b: SharedResourceBooking): string {
  if (b.client_name) return b.client_name;
  if (b.service_name) return b.service_name;
  return b.resource_name ? `${b.resource_name} — reservado` : 'Reservado';
}
