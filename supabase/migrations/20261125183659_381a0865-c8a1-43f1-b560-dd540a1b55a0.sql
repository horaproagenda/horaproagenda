CREATE OR REPLACE FUNCTION public.delete_product_safe(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text; v_uid uuid := auth.uid(); p record;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Sem permissão para excluir este produto.' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.products WHERE id = p_id FOR UPDATE;
 IF NOT FOUND OR p.account_owner_id IS DISTINCT FROM public.current_account_owner_id() THEN
   RAISE EXCEPTION 'Produto não encontrado ou sem permissão para excluir.' USING ERRCODE='42501';
 END IF;
 IF NOT (
   public.has_role(v_uid,'admin')
   OR (public.has_role(v_uid,'professional') AND p.created_by = v_uid)
   OR (public.has_role(v_uid,'professional') AND public.professional_permission('can_manage_products') AND p.owner_professional_id IS NULL)
 ) THEN
   RAISE EXCEPTION 'Sem permissão para excluir este produto.' USING ERRCODE='42501';
 END IF;
 v_name := p.name;
 PERFORM set_config('app.deleting_product_id', p_id::text, true);
 UPDATE public.appointment_additional_items
    SET notes = COALESCE(NULLIF(btrim(notes),''), v_name), product_id = NULL
  WHERE product_id = p_id;
 UPDATE public.application_items SET product_id = NULL WHERE product_id = p_id;
 DELETE FROM public.product_usage_events WHERE product_id = p_id;
 DELETE FROM public.product_daily_consumption WHERE product_id = p_id;
 DELETE FROM public.appointment_product_consumption WHERE product_id = p_id;
 DELETE FROM public.product_usage_records WHERE product_id = p_id;
 DELETE FROM public.service_products WHERE product_id = p_id;
 DELETE FROM public.package_template_products WHERE product_id = p_id;
 DELETE FROM public.product_purchases WHERE product_id = p_id;
 DELETE FROM public.products WHERE id = p_id;
 PERFORM set_config('app.deleting_product_id', '', true);
 RETURN jsonb_build_object('result','deleted');
END $$;
REVOKE EXECUTE ON FUNCTION public.delete_product_safe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_product_safe(uuid) TO authenticated;