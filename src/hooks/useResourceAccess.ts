import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Salas e equipamentos que o profissional logado pode ver, filtrar e agendar.
 *
 * Listas vazias significam "sem restrição" (comportamento anterior ao recurso).
 * Administrador e recepção sempre veem tudo.
 */
export interface ResourceAccess {
  isPrivileged: boolean;
  allowedRoomIds: string[];
  allowedEquipmentIds: string[];
  canUseRoom: (id?: string | null) => boolean;
  canUseEquipment: (id?: string | null) => boolean;
  isLoading: boolean;
}

export function useResourceAccess(): ResourceAccess {
  const { user, hasRole } = useAuth();
  const isPrivileged = hasRole('admin') || hasRole('receptionist');

  const { data, isLoading } = useQuery({
    queryKey: ['professional-resource-access', user?.id],
    enabled: !!user?.id && !isPrivileged,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: row } = await supabase
        .from('professionals')
        .select('allowed_room_ids, allowed_equipment_ids')
        .eq('user_id', user!.id)
        .maybeSingle();
      const record = (row ?? {}) as Record<string, unknown>;
      return {
        rooms: (record.allowed_room_ids as string[] | null) ?? [],
        equipment: (record.allowed_equipment_ids as string[] | null) ?? [],
      };
    },
  });

  const allowedRoomIds = isPrivileged ? [] : data?.rooms ?? [];
  const allowedEquipmentIds = isPrivileged ? [] : data?.equipment ?? [];

  const canUseRoom = (id?: string | null) =>
    isPrivileged || allowedRoomIds.length === 0 || (!!id && allowedRoomIds.includes(id));
  const canUseEquipment = (id?: string | null) =>
    isPrivileged || allowedEquipmentIds.length === 0 || (!!id && allowedEquipmentIds.includes(id));

  return {
    isPrivileged,
    allowedRoomIds,
    allowedEquipmentIds,
    canUseRoom,
    canUseEquipment,
    isLoading: isPrivileged ? false : isLoading,
  };
}
