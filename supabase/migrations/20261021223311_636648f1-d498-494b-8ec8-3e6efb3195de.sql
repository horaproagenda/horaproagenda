CREATE OR REPLACE FUNCTION public.get_seat_usage_report()
RETURNS TABLE(owner_user_id uuid, used integer, seat_limit integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF public.has_role(auth.uid(), 'super_admin') THEN
    RETURN QUERY
      SELECT s.owner_user_id, public.count_account_seats(s.owner_user_id), s.seat_limit
      FROM public.account_subscriptions s
      WHERE NOT COALESCE(s.is_grandfathered,false) AND COALESCE(s.seat_limit,0) > 0;
    RETURN;
  END IF;
  v_owner := public.get_account_owner(auth.uid());
  IF v_owner IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT s.owner_user_id, public.count_account_seats(s.owner_user_id), s.seat_limit
    FROM public.account_subscriptions s
    WHERE s.owner_user_id = v_owner
      AND NOT COALESCE(s.is_grandfathered,false) AND COALESCE(s.seat_limit,0) > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.get_seat_usage_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_seat_usage_report() TO authenticated;