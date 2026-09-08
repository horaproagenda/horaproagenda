ALTER TABLE public.product_usage_records
  ADD COLUMN IF NOT EXISTS cycle_key text,
  ADD COLUMN IF NOT EXISTS stock_after numeric;

ALTER TABLE public.product_daily_consumption
  ADD COLUMN IF NOT EXISTS cycle_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_usage_records_cycle
  ON public.product_usage_records (product_id, cycle_key)
  WHERE cycle_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_daily_consumption_cycle
  ON public.product_daily_consumption (product_id, cycle_key)
  WHERE cycle_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.start_product_usage_cycle(
  _product_id uuid,
  _start_date date,
  _quantity numeric,
  _unit text,
  _purchase_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_purchase public.product_purchases%ROWTYPE;
  v_purchase_id uuid;
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Faça login novamente para registrar o uso.';
  END IF;
  IF _start_date IS NULL THEN
    RAISE EXCEPTION 'Informe a data de início.';
  END IF;
  IF COALESCE(_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Informe uma quantidade maior que zero.';
  END IF;
  IF _unit NOT IN ('un','mg','g','kg','ml','l','other') THEN
    RAISE EXCEPTION 'Informe uma grandeza válida.';
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado ou sem acesso.'; END IF;
  IF _unit <> v_product.unit THEN
    RAISE EXCEPTION 'A grandeza informada deve ser a mesma do estoque do produto.';
  END IF;
  IF _quantity > COALESCE(v_product.current_stock, 0) THEN
    RAISE EXCEPTION 'A quantidade em uso não pode ser maior que o estoque disponível.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.product_purchases
    WHERE product_id = _product_id AND started_using_at IS NOT NULL AND finished_at IS NULL
      AND (_purchase_id IS NULL OR id <> _purchase_id)
  ) THEN
    RAISE EXCEPTION 'Este produto já possui uma quantidade em uso.';
  END IF;

  IF _purchase_id IS NOT NULL THEN
    SELECT * INTO v_purchase FROM public.product_purchases
    WHERE id = _purchase_id AND product_id = _product_id FOR UPDATE;
  ELSE
    SELECT * INTO v_purchase FROM public.product_purchases
    WHERE product_id = _product_id AND started_using_at IS NULL AND finished_at IS NULL
    ORDER BY purchase_date, created_at LIMIT 1 FOR UPDATE;
  END IF;

  IF v_purchase.id IS NOT NULL THEN
    UPDATE public.product_purchases
       SET started_using_at = _start_date,
           finished_at = NULL,
           cycle_quantity = _quantity,
           cycle_appointments = NULL,
           avg_quantity_per_appointment = NULL,
           updated_by = v_user
     WHERE id = v_purchase.id
     RETURNING id INTO v_purchase_id;
  ELSE
    INSERT INTO public.product_purchases (
      product_id, quantity, unit_price, total_price, purchase_date,
      started_using_at, cycle_quantity, created_by, updated_by,
      account_owner_id, notes
    ) VALUES (
      _product_id, _quantity, 0, 0, _start_date,
      _start_date, _quantity, v_user, v_user,
      v_product.account_owner_id, 'Ciclo iniciado sem nova compra'
    ) RETURNING id INTO v_purchase_id;
  END IF;

  UPDATE public.products
     SET started_using_at = _start_date,
         finished_at = NULL,
         cycle_quantity = _quantity,
         updated_by = v_user
   WHERE id = _product_id;

  RETURN jsonb_build_object(
    'product_id', _product_id,
    'purchase_id', v_purchase_id,
    'start_date', _start_date,
    'quantity', _quantity,
    'unit', _unit
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_product_usage_cycle(
  _product_id uuid,
  _purchase_id uuid,
  _end_date date,
  _unit text,
  _appointment_ids uuid[],
  _appointment_dates date[],
  _service_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_purchase public.product_purchases%ROWTYPE;
  v_existing public.product_usage_records%ROWTYPE;
  v_user uuid := auth.uid();
  v_cycle_key text := _purchase_id::text;
  v_quantity numeric;
  v_stock_after numeric;
  v_count integer := COALESCE(array_length(_appointment_ids, 1), 0);
  v_days integer;
  v_average numeric;
  v_index integer;
  v_base numeric;
  v_remainder numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Faça login novamente para registrar o uso.'; END IF;
  IF _purchase_id IS NULL OR _end_date IS NULL THEN RAISE EXCEPTION 'Informe o ciclo e a data de término.'; END IF;
  IF COALESCE(array_length(_appointment_dates, 1), 0) <> v_count
     OR (_service_ids IS NOT NULL AND COALESCE(array_length(_service_ids, 1), 0) <> v_count) THEN
    RAISE EXCEPTION 'Os atendimentos do ciclo estão incompletos.';
  END IF;

  SELECT * INTO v_existing FROM public.product_usage_records
   WHERE product_id = _product_id AND cycle_key = v_cycle_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'product_id', _product_id,
      'purchase_id', _purchase_id,
      'usage_record_id', v_existing.id,
      'stock_after', v_existing.stock_after,
      'already_finished', true
    );
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado ou sem acesso.'; END IF;
  SELECT * INTO v_purchase FROM public.product_purchases
   WHERE id = _purchase_id AND product_id = _product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro da quantidade em uso não encontrado.'; END IF;
  IF v_purchase.started_using_at IS NULL THEN RAISE EXCEPTION 'Registre a data de início antes do término.'; END IF;
  IF _end_date < v_purchase.started_using_at THEN RAISE EXCEPTION 'A data de término não pode ser anterior ao início.'; END IF;
  IF _unit <> v_product.unit THEN RAISE EXCEPTION 'A grandeza informada deve ser a mesma do estoque do produto.'; END IF;

  v_quantity := COALESCE(NULLIF(v_purchase.cycle_quantity, 0), NULLIF(v_product.cycle_quantity, 0));
  IF COALESCE(v_quantity, 0) <= 0 THEN RAISE EXCEPTION 'A quantidade em uso não foi informada.'; END IF;
  IF v_quantity > COALESCE(v_product.current_stock, 0) THEN RAISE EXCEPTION 'A quantidade usada é maior que o estoque disponível.'; END IF;

  v_days := (_end_date - v_purchase.started_using_at) + 1;
  v_average := CASE WHEN v_count > 0 THEN v_quantity / v_count ELSE NULL END;
  v_stock_after := GREATEST(0, COALESCE(v_product.current_stock, 0) - v_quantity);

  UPDATE public.product_purchases
     SET finished_at = _end_date,
         cycle_quantity = v_quantity,
         cycle_appointments = v_count,
         avg_quantity_per_appointment = v_average,
         duration_days = v_days,
         updated_by = v_user
   WHERE id = _purchase_id;

  INSERT INTO public.product_usage_records (
    product_id, calc_mode, container_amount, container_unit,
    quantity_per_appointment, avg_quantity_per_appointment,
    start_date, end_date, appointments_counted, appointment_ids,
    total_consumed, container_yield, created_by, account_owner_id,
    cycle_key, stock_after
  ) VALUES (
    _product_id, 'auto', v_quantity, _unit,
    NULL, v_average,
    v_purchase.started_using_at, _end_date, v_count, COALESCE(_appointment_ids, ARRAY[]::uuid[]),
    v_quantity, NULLIF(v_count, 0), v_user, v_product.account_owner_id,
    v_cycle_key, v_stock_after
  ) RETURNING * INTO v_existing;

  IF v_count = 0 THEN
    INSERT INTO public.product_daily_consumption (
      product_id, consumption_date, quantity_used, unit, professional_id,
      service_id, appointment_id, notes, created_by, account_owner_id, cycle_key
    ) VALUES (
      _product_id, _end_date, v_quantity, _unit, v_product.owner_professional_id,
      NULL, NULL, 'Consumo do ciclo de uso', v_user, v_product.account_owner_id, v_cycle_key
    );
  ELSE
    v_base := trunc((v_quantity / v_count) * 10000) / 10000;
    v_remainder := v_quantity - (v_base * v_count);
    FOR v_index IN 1..v_count LOOP
      INSERT INTO public.product_daily_consumption (
        product_id, consumption_date, quantity_used, unit, professional_id,
        service_id, appointment_id, notes, created_by, account_owner_id, cycle_key
      ) VALUES (
        _product_id, _appointment_dates[v_index],
        CASE WHEN v_index = v_count THEN v_base + v_remainder ELSE v_base END,
        _unit, v_product.owner_professional_id,
        CASE WHEN _service_ids IS NULL THEN NULL ELSE _service_ids[v_index] END,
        _appointment_ids[v_index], 'Consumo do ciclo de uso', v_user,
        v_product.account_owner_id, v_cycle_key
      );
    END LOOP;
  END IF;

  UPDATE public.products
     SET finished_at = _end_date,
         current_stock = v_stock_after,
         cycle_quantity = NULL,
         updated_by = v_user
   WHERE id = _product_id;

  RETURN jsonb_build_object(
    'product_id', _product_id,
    'purchase_id', _purchase_id,
    'usage_record_id', v_existing.id,
    'start_date', v_purchase.started_using_at,
    'end_date', _end_date,
    'quantity', v_quantity,
    'unit', _unit,
    'appointments', v_count,
    'average_per_appointment', v_average,
    'duration_days', v_days,
    'stock_after', v_stock_after,
    'already_finished', false
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing FROM public.product_usage_records
     WHERE product_id = _product_id AND cycle_key = v_cycle_key;
    RETURN jsonb_build_object(
      'product_id', _product_id,
      'purchase_id', _purchase_id,
      'usage_record_id', v_existing.id,
      'stock_after', v_existing.stock_after,
      'already_finished', true
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_product_usage_cycle(uuid,date,numeric,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_product_usage_cycle(uuid,uuid,date,text,uuid[],date[],uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_product_usage_cycle(uuid,date,numeric,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_product_usage_cycle(uuid,uuid,date,text,uuid[],date[],uuid[]) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'product_usage_records'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.product_usage_records;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'product_daily_consumption'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.product_daily_consumption;
  END IF;
END $$;