-- Restaurar permissão de execução das funções usadas por RLS
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_professional_id_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_service_package(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_package_appointment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_client_record(uuid) TO authenticated;

-- Reforçar funções de acesso com SECURITY DEFINER e search_path fixo
CREATE OR REPLACE FUNCTION public.can_access_service_package(_package_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.service_packages sp
      WHERE sp.id = _package_id
        AND (
          sp.professional_id IS NULL
          OR sp.professional_id = public.get_professional_id_for_user(auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.clients c
            WHERE c.id = sp.client_id
              AND c.assigned_professional_id = public.get_professional_id_for_user(auth.uid())
          )
          OR EXISTS (
            SELECT 1
            FROM public.package_appointments pa
            JOIN public.appointments a ON a.id = pa.appointment_id
            WHERE pa.package_id = sp.id
              AND a.professional_id = public.get_professional_id_for_user(auth.uid())
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_package_appointment(_package_appointment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.package_appointments pa
    LEFT JOIN public.appointments a ON a.id = pa.appointment_id
    WHERE pa.id = _package_appointment_id
      AND (
        public.can_access_service_package(pa.package_id)
        OR a.professional_id = public.get_professional_id_for_user(auth.uid())
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_service_package(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_package_appointment(uuid) TO authenticated;

-- Trava de segurança: impedir exclusão permanente dos dados centrais da agenda
CREATE OR REPLACE FUNCTION public.prevent_agenda_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Exclusão permanente bloqueada: este registro da agenda deve ser preservado. Use cancelamento, inativação ou edição controlada.';
END;
$$;

DROP TRIGGER IF EXISTS prevent_clients_hard_delete ON public.clients;
CREATE TRIGGER prevent_clients_hard_delete
BEFORE DELETE ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.prevent_agenda_hard_delete();

DROP TRIGGER IF EXISTS prevent_appointments_hard_delete ON public.appointments;
CREATE TRIGGER prevent_appointments_hard_delete
BEFORE DELETE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.prevent_agenda_hard_delete();

DROP TRIGGER IF EXISTS prevent_service_packages_hard_delete ON public.service_packages;
CREATE TRIGGER prevent_service_packages_hard_delete
BEFORE DELETE ON public.service_packages
FOR EACH ROW
EXECUTE FUNCTION public.prevent_agenda_hard_delete();

DROP TRIGGER IF EXISTS prevent_package_appointments_hard_delete ON public.package_appointments;
CREATE TRIGGER prevent_package_appointments_hard_delete
BEFORE DELETE ON public.package_appointments
FOR EACH ROW
EXECUTE FUNCTION public.prevent_agenda_hard_delete();

-- Trava adicional: impedir que pacotes com sessões vinculadas sejam ocultados por inativação acidental
CREATE OR REPLACE FUNCTION public.prevent_used_package_deactivation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
$$;

DROP TRIGGER IF EXISTS prevent_used_package_deactivation ON public.service_packages;
CREATE TRIGGER prevent_used_package_deactivation
BEFORE UPDATE OF is_active ON public.service_packages
FOR EACH ROW
EXECUTE FUNCTION public.prevent_used_package_deactivation();