
CREATE OR REPLACE FUNCTION public.list_account_seat_usage_admin()
RETURNS TABLE (
  owner_user_id uuid,
  email text,
  status text,
  is_grandfathered boolean,
  seat_limit integer,
  used integer,
  available integer,
  current_period_end timestamptz,
  trial_ends_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    s.owner_user_id,
    u.email::text,
    s.status::text,
    COALESCE(s.is_grandfathered, false) AS is_grandfathered,
    COALESCE(s.seat_limit, 0) AS seat_limit,
    public.count_account_seats(s.owner_user_id) AS used,
    GREATEST(COALESCE(s.seat_limit, 0) - public.count_account_seats(s.owner_user_id), 0) AS available,
    s.current_period_end,
    s.trial_ends_at
  FROM public.account_subscriptions s
  LEFT JOIN auth.users u ON u.id = s.owner_user_id
  ORDER BY u.email NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_account_seat_usage_admin() TO authenticated;
