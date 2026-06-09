
-- Force delete a professional and detach/clean all related data.
-- Only admins can execute. Returns void; raises if not allowed.
CREATE OR REPLACE FUNCTION public.force_delete_professional(_professional_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem excluir profissionais.';
  END IF;

  SELECT user_id INTO _user FROM public.professionals WHERE id = _professional_id;

  -- Detach references on nullable columns
  UPDATE public.appointments               SET professional_id = NULL WHERE professional_id = _professional_id;
  UPDATE public.appointment_additional_items SET professional_id = NULL WHERE professional_id = _professional_id;
  UPDATE public.services                   SET professional_id = NULL WHERE professional_id = _professional_id;
  UPDATE public.service_packages           SET professional_id = NULL WHERE professional_id = _professional_id;
  UPDATE public.package_templates          SET professional_id = NULL WHERE professional_id = _professional_id;
  UPDATE public.financial_entries          SET professional_id = NULL WHERE professional_id = _professional_id;
  UPDATE public.whatsapp_templates         SET professional_id = NULL WHERE professional_id = _professional_id;
  UPDATE public.document_fill_links        SET professional_id = NULL WHERE professional_id = _professional_id;
  UPDATE public.product_daily_consumption  SET professional_id = NULL WHERE professional_id = _professional_id;
  UPDATE public.client_credit_transactions SET professional_id = NULL WHERE professional_id = _professional_id;
  UPDATE public.waitlist                   SET professional_id = NULL WHERE professional_id = _professional_id;
  UPDATE public.whatsapp_send_queue        SET professional_id = NULL WHERE professional_id = _professional_id;
  UPDATE public.clients                    SET assigned_professional_id = NULL WHERE assigned_professional_id = _professional_id;
  UPDATE public.ultramsg_instance_pool     SET assigned_professional_id = NULL, status = 'available' WHERE assigned_professional_id = _professional_id;

  -- Delete owned/required-FK rows
  DELETE FROM public.professional_absences            WHERE professional_id = _professional_id;
  DELETE FROM public.professional_credentials         WHERE professional_id = _professional_id;
  DELETE FROM public.professional_service_commissions WHERE professional_id = _professional_id;
  DELETE FROM public.professional_whatsapp_credentials WHERE professional_id = _professional_id;
  DELETE FROM public.client_registration_links        WHERE professional_id = _professional_id;

  -- Remove user roles linked to this professional (if any)
  IF _user IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id = _user AND role = 'professional';
  END IF;

  DELETE FROM public.professionals WHERE id = _professional_id;
END;
$$;

REVOKE ALL ON FUNCTION public.force_delete_professional(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.force_delete_professional(uuid) TO authenticated;
