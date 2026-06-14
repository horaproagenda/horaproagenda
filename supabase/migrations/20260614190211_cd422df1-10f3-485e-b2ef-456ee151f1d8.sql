
-- 1. Add confirmation token to appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS confirmation_token uuid UNIQUE DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS confirmation_responded_at timestamptz;

UPDATE public.appointments SET confirmation_token = gen_random_uuid() WHERE confirmation_token IS NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_confirmation_token ON public.appointments(confirmation_token);

-- 2. Add include_confirmation_buttons to whatsapp_templates
ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS include_confirmation_buttons boolean NOT NULL DEFAULT false;

-- 3. Public RPC to confirm/cancel by token (security definer, bypasses RLS for token-based access)
CREATE OR REPLACE FUNCTION public.confirm_appointment_by_token(
  p_token uuid,
  p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  IF v_appt.status IN ('completed','missed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este agendamento já foi finalizado.');
  END IF;

  IF v_appt.status = 'cancelled' AND p_action = 'cancel' THEN
    RETURN jsonb_build_object('success', true, 'status', 'cancelled', 'already', true,
      'client_name', (SELECT name FROM public.clients WHERE id = v_appt.client_id),
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
$$;

GRANT EXECUTE ON FUNCTION public.confirm_appointment_by_token(uuid, text) TO anon, authenticated;
