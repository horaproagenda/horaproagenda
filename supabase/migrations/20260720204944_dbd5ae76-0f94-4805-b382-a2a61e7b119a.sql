
CREATE OR REPLACE FUNCTION public.log_seat_limit_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.seat_limit IS DISTINCT FROM NEW.seat_limit THEN
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, account_owner_id)
    VALUES (
      NEW.owner_user_id,
      CASE WHEN NEW.seat_limit > COALESCE(OLD.seat_limit,0) THEN 'seat_upgrade' ELSE 'seat_downgrade' END,
      'account_subscriptions',
      NEW.id,
      jsonb_build_object('seat_limit', OLD.seat_limit),
      jsonb_build_object('seat_limit', NEW.seat_limit, 'stripe_price_id', NEW.stripe_price_id),
      NEW.owner_user_id
    );
  END IF;
  RETURN NEW;
END;
$function$;
