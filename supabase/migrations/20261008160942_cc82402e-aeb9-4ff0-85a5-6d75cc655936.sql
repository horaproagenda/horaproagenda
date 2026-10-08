CREATE OR REPLACE FUNCTION public.adjust_product_stock(p_product_id uuid, p_delta numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_new numeric;
BEGIN
  UPDATE public.products
     SET current_stock = GREATEST(0, COALESCE(current_stock,0) + p_delta),
         updated_at = now()
   WHERE id = p_product_id
   RETURNING current_stock INTO v_new;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado ou sem permissão para alterar o estoque.';
  END IF;
  RETURN v_new;
END $$;
REVOKE ALL ON FUNCTION public.adjust_product_stock(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(uuid, numeric) TO authenticated, service_role;