CREATE OR REPLACE FUNCTION public.heal_packages_without_sale()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _owner uuid := auth.uid();
  _acct uuid := public.current_account_owner_id();
  _pkg RECORD;
  _created int := 0;
  _ids uuid[] := ARRAY[]::uuid[];
  _pm_id uuid;
  _pm_name text;
  _is_paid boolean;
BEGIN
  FOR _pkg IN
    SELECT p.id, p.name, p.client_id, p.total_price, p.created_at,
           p.payment_method, p.payment_methods, p.account_owner_id
    FROM public.service_packages p
    WHERE p.client_id IS NOT NULL
      AND (_acct IS NULL OR p.account_owner_id = _acct)
      AND NOT EXISTS (SELECT 1 FROM public.single_sales s WHERE s.package_id = p.id)
  LOOP
    _pm_name := COALESCE(
      NULLIF(_pkg.payment_method, ''),
      CASE WHEN _pkg.payment_methods IS NOT NULL AND array_length(_pkg.payment_methods, 1) > 0
           THEN _pkg.payment_methods[1] ELSE NULL END
    );

    _pm_id := NULL;
    IF _pm_name IS NOT NULL THEN
      SELECT pm.id INTO _pm_id
      FROM public.payment_methods pm
      WHERE pm.account_owner_id = _pkg.account_owner_id
        AND (pm.id::text = _pm_name OR pm.name ILIKE _pm_name)
      LIMIT 1;
    END IF;

    _is_paid := _pm_name IS NOT NULL;

    INSERT INTO public.single_sales (
      client_id, package_id, item_type, description,
      original_amount, discount_amount, final_amount,
      payment_method_id, sale_date, paid_at, created_by, account_owner_id, notes
    ) VALUES (
      _pkg.client_id, _pkg.id, 'package', _pkg.name,
      COALESCE(_pkg.total_price, 0), 0, COALESCE(_pkg.total_price, 0),
      _pm_id, _pkg.created_at::date,
      CASE WHEN _is_paid THEN _pkg.created_at ELSE NULL END,
      _owner, _pkg.account_owner_id,
      'Registro criado automaticamente para o pacote agendado.'
    );

    _created := _created + 1;
    _ids := _ids || _pkg.id;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'created_sales', _created, 'package_ids', to_jsonb(_ids));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.heal_packages_without_sale() TO authenticated;
GRANT EXECUTE ON FUNCTION public.heal_packages_without_sale() TO service_role;