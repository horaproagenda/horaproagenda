CREATE OR REPLACE FUNCTION public.confirm_appointment_by_token(p_token uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_new_status public.appointment_status;
  v_client_name text;
  v_start timestamptz;
BEGIN
  IF p_action NOT IN ('confirm', 'cancel') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ação inválida.');
  END IF;

  SELECT * INTO v_appt FROM public.appointments WHERE confirmation_token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Link inválido ou expirado.');
  END IF;

  IF v_appt.status IN ('completed','missed','rescheduled') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'finalized',
      'error', 'Este agendamento já foi finalizado.');
  END IF;

  IF v_appt.status = 'cancelled' AND p_action = 'cancel' THEN
    RETURN jsonb_build_object('success', true, 'status', 'cancelled', 'already', true,
      'client_name', (SELECT name FROM public.clients WHERE id = v_appt.client_id),
      'start_time', v_appt.start_time);
  END IF;

  -- Um horário cancelado NUNCA volta a ser confirmado por resposta de WhatsApp.
  IF v_appt.status = 'cancelled' AND p_action = 'confirm' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'cancelled',
      'error', 'Este horário está cancelado e não pode ser confirmado.',
      'start_time', v_appt.start_time);
  END IF;

  IF v_appt.status = 'confirmed' AND p_action = 'confirm' THEN
    RETURN jsonb_build_object('success', true, 'status', 'confirmed', 'already', true,
      'client_name', (SELECT name FROM public.clients WHERE id = v_appt.client_id),
      'start_time', v_appt.start_time);
  END IF;

  v_new_status := CASE WHEN p_action = 'confirm' THEN 'confirmed'::public.appointment_status
                       ELSE 'cancelled'::public.appointment_status END;

  UPDATE public.appointments
     SET status = v_new_status,
         confirmation_responded_at = now(),
         updated_at = now()
   WHERE id = v_appt.id;

  SELECT name INTO v_client_name FROM public.clients WHERE id = v_appt.client_id;
  v_start := v_appt.start_time;

  RETURN jsonb_build_object(
    'success', true,
    'status', v_new_status::text,
    'already', false,
    'client_name', v_client_name,
    'start_time', v_start
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_professional_self_privilege_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS DISTINCT FROM OLD.user_id THEN
    RETURN NEW;
  END IF;

  IF NEW.permissions IS DISTINCT FROM OLD.permissions THEN
    RAISE EXCEPTION 'Professionals cannot modify their own permissions';
  END IF;
  IF NEW.app_role IS DISTINCT FROM OLD.app_role THEN
    RAISE EXCEPTION 'Professionals cannot modify their own role';
  END IF;
  IF NEW.whatsapp_release_approved IS DISTINCT FROM OLD.whatsapp_release_approved THEN
    RAISE EXCEPTION 'Professionals cannot approve their own WhatsApp release';
  END IF;
  IF NEW.is_commission_based IS DISTINCT FROM OLD.is_commission_based
     OR NEW.commission_percentage IS DISTINCT FROM OLD.commission_percentage
     OR NEW.commission_type IS DISTINCT FROM OLD.commission_type
     OR NEW.commission_fixed_value IS DISTINCT FROM OLD.commission_fixed_value
     OR NEW.commission_frequency IS DISTINCT FROM OLD.commission_frequency
     OR NEW.commission_payment_day IS DISTINCT FROM OLD.commission_payment_day THEN
    RAISE EXCEPTION 'Professionals cannot modify their own commission settings';
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'Professionals cannot toggle their own active status';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Professionals cannot change their user_id';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_professional_privilege_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR current_user IN ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.app_role IS DISTINCT FROM OLD.app_role
     OR NEW.permissions IS DISTINCT FROM OLD.permissions
     OR NEW.whatsapp_release_approved IS DISTINCT FROM OLD.whatsapp_release_approved
     OR NEW.is_commission_based IS DISTINCT FROM OLD.is_commission_based
     OR NEW.commission_type IS DISTINCT FROM OLD.commission_type
     OR NEW.commission_percentage IS DISTINCT FROM OLD.commission_percentage
     OR NEW.commission_fixed_value IS DISTINCT FROM OLD.commission_fixed_value
     OR NEW.commission_frequency IS DISTINCT FROM OLD.commission_frequency
     OR NEW.commission_payment_day IS DISTINCT FROM OLD.commission_payment_day
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
  THEN
    RAISE EXCEPTION 'Only admins can modify role, permissions, WhatsApp release, commission settings, account link or active status of a professional.';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_account_subscription_billing_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_privileged boolean;
BEGIN
  is_privileged := (auth.role() IS DISTINCT FROM 'authenticated');

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'inactive';
    NEW.plan_tier := NULL;
    NEW.seat_limit := 1;
    NEW.trial_ends_at := NULL;
    NEW.current_period_end := NULL;
    NEW.stripe_customer_id := NULL;
    NEW.stripe_subscription_id := NULL;
    NEW.is_grandfathered := false;
    RETURN NEW;
  END IF;

  NEW.status := OLD.status;
  NEW.plan_tier := OLD.plan_tier;
  NEW.seat_limit := OLD.seat_limit;
  NEW.trial_ends_at := OLD.trial_ends_at;
  NEW.current_period_end := OLD.current_period_end;
  NEW.stripe_customer_id := OLD.stripe_customer_id;
  NEW.stripe_subscription_id := OLD.stripe_subscription_id;
  NEW.is_grandfathered := OLD.is_grandfathered;
  NEW.owner_user_id := OLD.owner_user_id;
  RETURN NEW;
END;
$function$;