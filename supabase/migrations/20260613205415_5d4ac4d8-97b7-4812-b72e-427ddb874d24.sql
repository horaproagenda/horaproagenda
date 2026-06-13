
CREATE OR REPLACE FUNCTION public.claim_ultramsg_pool_instance(p_professional_id UUID)
RETURNS TABLE(id UUID, instance_id TEXT, token TEXT, api_url TEXT, activated_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.ultramsg_instance_pool%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.ultramsg_instance_pool p
  WHERE p.assigned_professional_id = p_professional_id AND p.status = 'assigned'
  LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_row.id, v_row.instance_id, v_row.token, v_row.api_url, v_row.activated_at;
    RETURN;
  END IF;

  UPDATE public.ultramsg_instance_pool p
  SET status = 'assigned',
      assigned_professional_id = p_professional_id,
      assigned_at = now(),
      activated_at = now()
  WHERE p.id = (
    SELECT p2.id FROM public.ultramsg_instance_pool p2
    WHERE p2.status = 'free'
    ORDER BY p2.created_at ASC NULLS LAST, p2.id
    LIMIT 1 FOR UPDATE SKIP LOCKED
  )
  RETURNING p.* INTO v_row;

  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY SELECT v_row.id, v_row.instance_id, v_row.token, v_row.api_url, v_row.activated_at;
END;
$$;
