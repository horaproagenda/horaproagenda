import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface SharedRoomBooking {
  id: string;
  room_id: string | null;
  room_name: string | null;
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
 * Reservas de salas compartilhadas dos OUTROS profissionais.
 *
 * O mascaramento é feito no servidor (`public.get_shared_room_bookings`):
 * por padrão volta apenas sala, data, início, término e status. Cliente,
 * serviço, valor e observações só vêm se o Administrador liberar cada item
 * no cadastro do profissional. Não há como obter mais alterando a requisição.
 */
export function useSharedRoomBookings(from: Date | string, to: Date | string) {
  const { user } = useAuth();
  const fromISO = typeof from === 'string' ? from : from.toISOString();
  const toISO = typeof to === 'string' ? to : to.toISOString();

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['shared-room-bookings', user?.id, fromISO, toISO],
    queryFn: async (): Promise<SharedRoomBooking[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('get_shared_room_bookings', {
        _from: fromISO,
        _to: toISO,
      });
      if (error) {
        console.warn('get_shared_room_bookings:', error);
        return [];
      }
      return (data ?? []) as SharedRoomBooking[];
    },
    enabled: !!user?.id,
    staleTime: 15_000,
  });

  return { bookings: data, isLoading, refetch };
}

/** Rótulo seguro para exibir na agenda quando o atendimento é de outro profissional. */
export function sharedBookingLabel(b: SharedRoomBooking): string {
  if (b.client_name) return b.client_name;
  if (b.service_name) return b.service_name;
  return 'Reservado';
}
