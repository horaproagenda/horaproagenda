-- Remove triggers que bloqueavam exclusão de agendamentos, clientes e pacotes.
-- O controle de acesso já é feito por RLS; o app precisa poder excluir registros.
DROP TRIGGER IF EXISTS prevent_appointments_hard_delete ON public.appointments;
DROP TRIGGER IF EXISTS prevent_clients_hard_delete ON public.clients;
DROP TRIGGER IF EXISTS prevent_package_appointments_hard_delete ON public.package_appointments;
DROP TRIGGER IF EXISTS prevent_service_packages_hard_delete ON public.service_packages;

-- Permite que admins desativem pacotes mesmo com histórico (mantém regra para não-admins).
CREATE OR REPLACE FUNCTION public.prevent_used_package_deactivation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Admins podem desativar livremente
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF OLD.is_active = true
     AND NEW.is_active = false
     AND EXISTS (
       SELECT 1
       FROM public.package_appointments pa
       WHERE pa.package_id = OLD.id
         AND (
           pa.appointment_id IS NOT NULL
           OR pa.status IN ('pending', 'scheduled', 'completed', 'missed')
         )
     ) THEN
    RAISE EXCEPTION 'Este pacote possui aplicações registradas e não pode ser ocultado/inativado automaticamente.';
  END IF;

  RETURN NEW;
END;
$function$;