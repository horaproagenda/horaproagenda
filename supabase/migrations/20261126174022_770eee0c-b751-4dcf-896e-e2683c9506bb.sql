ALTER TABLE public.appointment_additional_items ADD COLUMN IF NOT EXISTS product_name_snapshot text;
UPDATE public.appointment_additional_items a SET product_name_snapshot = p.name FROM public.products p WHERE a.product_id = p.id AND a.product_name_snapshot IS NULL;
ALTER TABLE public.appointment_additional_items DROP CONSTRAINT appointment_additional_items_item_ref_check;
ALTER TABLE public.appointment_additional_items ADD CONSTRAINT appointment_additional_items_item_ref_check CHECK (
 (item_type='service' AND service_id IS NOT NULL AND product_id IS NULL)
 OR (item_type='product' AND service_id IS NULL AND (product_id IS NOT NULL OR product_name_snapshot IS NOT NULL)));
ALTER TABLE public.appointment_additional_items DROP CONSTRAINT appointment_additional_items_product_id_fkey;
ALTER TABLE public.appointment_additional_items ADD CONSTRAINT appointment_additional_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.delete_product_safe(p_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
    SET product_name_snapshot = COALESCE(product_name_snapshot, v_name),
        notes = COALESCE(NULLIF(btrim(notes),''), v_name), product_id = NULL
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
END $function$;