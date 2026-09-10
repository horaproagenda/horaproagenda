DROP VIEW IF EXISTS public.professionals_directory;

-- Receptionists can see professional rows again (non-sensitive columns only, enforced by column grants below)
DROP POLICY IF EXISTS tenant_select_professionals ON public.professionals;
CREATE POLICY tenant_select_professionals ON public.professionals
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    account_owner_id = public.current_account_owner_id()
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'receptionist'::app_role)
      OR auth.uid() = user_id
    )
  )
);

-- Column-level read restriction: sensitive identifiers are not readable through the table
REVOKE SELECT ON public.professionals FROM authenticated, anon;

GRANT SELECT (
  id, name, email, phone, specialties, bio, avatar_url, is_active, created_at, updated_at,
  agenda_color, app_role, is_commission_based, commission_percentage, updated_by, user_id,
  permissions, commission_type, commission_fixed_value, commission_frequency,
  commission_payment_day, company_name, whatsapp_from_number, quiet_hours_start,
  quiet_hours_end, account_owner_id, whatsapp_release_approved, whatsapp_release_approved_at,
  whatsapp_release_approved_by, allowed_room_ids, allowed_equipment_ids, employment_type,
  public_code
) ON public.professionals TO authenticated;

-- Sensitive fields only through a guarded function (admin of the tenant, or the professional themself)
CREATE OR REPLACE FUNCTION public.get_professional_sensitive_data(_professional_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rec public.professionals;
BEGIN
  SELECT * INTO rec FROM public.professionals WHERE id = _professional_id;
  IF rec.id IS NULL THEN
    RETURN NULL;
  END IF;
  IF rec.account_owner_id IS DISTINCT FROM public.current_account_owner_id() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR rec.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN jsonb_build_object(
    'cpf', rec.cpf,
    'cnpj', rec.cnpj,
    'birthdate', rec.birthdate,
    'cep', rec.cep,
    'street', rec.street,
    'number', rec.number,
    'complement', rec.complement,
    'neighborhood', rec.neighborhood,
    'city', rec.city,
    'state', rec.state,
    'beneficiary_address', rec.beneficiary_address,
    'beneficiary_cep', rec.beneficiary_cep,
    'beneficiary_city', rec.beneficiary_city,
    'beneficiary_state', rec.beneficiary_state
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_professional_sensitive_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_professional_sensitive_data(uuid) TO authenticated;