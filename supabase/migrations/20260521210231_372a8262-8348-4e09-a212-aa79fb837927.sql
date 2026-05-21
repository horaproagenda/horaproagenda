-- Add parent linkage and root tracking to financial_entries for partial payment chains
ALTER TABLE public.financial_entries
  ADD COLUMN IF NOT EXISTS parent_entry_id uuid REFERENCES public.financial_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS root_entry_id uuid REFERENCES public.financial_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS original_total_amount numeric;

CREATE INDEX IF NOT EXISTS idx_financial_entries_parent_entry_id ON public.financial_entries(parent_entry_id);
CREATE INDEX IF NOT EXISTS idx_financial_entries_root_entry_id ON public.financial_entries(root_entry_id);

-- Helper: get chain root id
CREATE OR REPLACE FUNCTION public.get_financial_entry_root(_entry_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH RECURSIVE chain AS (
    SELECT id, parent_entry_id, root_entry_id
      FROM public.financial_entries WHERE id = _entry_id
    UNION ALL
    SELECT fe.id, fe.parent_entry_id, fe.root_entry_id
      FROM public.financial_entries fe
      JOIN chain c ON fe.id = c.parent_entry_id
  )
  SELECT COALESCE(
    (SELECT id FROM chain WHERE parent_entry_id IS NULL LIMIT 1),
    _entry_id
  );
$$;

-- Atomic reverse: undo a payment in a partial-payment chain.
-- If ALL entries in the chain end up pending, consolidate into the root with the original total
-- and delete sibling remainder entries.
CREATE OR REPLACE FUNCTION public.reverse_payable_payment(_entry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_entry public.financial_entries%ROWTYPE;
  v_root_id uuid;
  v_root public.financial_entries%ROWTYPE;
  v_total_original numeric;
  v_other_paid_count integer;
  v_chain_ids uuid[];
BEGIN
  SELECT * INTO v_entry FROM public.financial_entries WHERE id = _entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento financeiro não encontrado.';
  END IF;

  IF v_entry.status <> 'paid' THEN
    RAISE EXCEPTION 'Apenas lançamentos pagos podem ter a baixa cancelada.';
  END IF;

  v_root_id := COALESCE(v_entry.root_entry_id, public.get_financial_entry_root(_entry_id));
  SELECT * INTO v_root FROM public.financial_entries WHERE id = v_root_id FOR UPDATE;

  -- Collect entire chain (root + all descendants)
  WITH RECURSIVE chain AS (
    SELECT id, parent_entry_id, status, amount, original_amount, original_total_amount
      FROM public.financial_entries WHERE id = v_root_id
    UNION ALL
    SELECT fe.id, fe.parent_entry_id, fe.status, fe.amount, fe.original_amount, fe.original_total_amount
      FROM public.financial_entries fe
      JOIN chain c ON fe.parent_entry_id = c.id
  )
  SELECT array_agg(id) INTO v_chain_ids FROM chain;

  -- Mark the target entry pending and restore its original amount
  UPDATE public.financial_entries
  SET status = 'pending',
      paid_date = NULL,
      paid_by = NULL,
      amount = COALESCE(original_amount, amount),
      original_amount = NULL,
      notes = COALESCE(notes,'') ||
              CASE WHEN COALESCE(notes,'') = '' THEN '' ELSE E'\n' END ||
              'Baixa cancelada em ' || to_char(now() AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI'),
      updated_at = now(),
      updated_by = auth.uid()
  WHERE id = _entry_id;

  -- Count how many entries in the chain remain paid AFTER this reversal
  SELECT COUNT(*) INTO v_other_paid_count
  FROM public.financial_entries
  WHERE id = ANY(v_chain_ids)
    AND status = 'paid';

  -- If everything is now pending, consolidate into a single entry (the root) with original total
  IF v_other_paid_count = 0 AND array_length(v_chain_ids, 1) > 1 THEN
    v_total_original := COALESCE(
      v_root.original_total_amount,
      (SELECT SUM(COALESCE(original_amount, amount))
         FROM public.financial_entries WHERE id = ANY(v_chain_ids))
    );

    UPDATE public.financial_entries
    SET amount = v_total_original,
        original_amount = NULL,
        status = 'pending',
        paid_date = NULL,
        paid_by = NULL,
        description = regexp_replace(description, '\s*\(restante.*?\)\s*$', '', 'gi'),
        notes = COALESCE(notes,'') ||
                CASE WHEN COALESCE(notes,'') = '' THEN '' ELSE E'\n' END ||
                'Pagamentos parciais desfeitos — valor total restaurado em ' ||
                to_char(now() AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI'),
        updated_at = now(),
        updated_by = auth.uid()
    WHERE id = v_root_id;

    DELETE FROM public.financial_entries
    WHERE id = ANY(v_chain_ids) AND id <> v_root_id;

    RETURN jsonb_build_object(
      'consolidated', true,
      'root_id', v_root_id,
      'total_amount', v_total_original
    );
  END IF;

  RETURN jsonb_build_object(
    'consolidated', false,
    'root_id', v_root_id,
    'reversed_entry_id', _entry_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverse_payable_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_financial_entry_root(uuid) TO authenticated;