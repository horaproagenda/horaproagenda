CREATE OR REPLACE FUNCTION public.audit_payment_integrity()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'package_appointments_pending_with_paid_sale',
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'appointment_id', a.id,
          'client_id', a.client_id,
          'package_id', sp.id,
          'package_name', sp.name,
          'sale_id', ss.id
        ))
        FROM public.appointments a
        JOIN public.package_appointments pa ON pa.id = a.package_appointment_id
        JOIN public.service_packages sp ON sp.id = pa.package_id
        JOIN public.single_sales ss ON ss.package_id = sp.id AND ss.client_id = a.client_id
        WHERE ss.paid_at IS NOT NULL
          AND COALESCE(ss.final_amount, 0) >= COALESCE(sp.total_price, 0)
          AND COALESCE(sp.total_price, 0) > 0
          AND a.payment_status IS DISTINCT FROM 'paid'
      ), '[]'::jsonb),
    'service_appointments_pending_with_paid_sale',
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'appointment_id', a.id,
          'client_id', a.client_id,
          'service_id', a.service_id,
          'sale_id', ss.id
        ))
        FROM public.appointments a
        JOIN public.client_services cs ON cs.appointment_id = a.id
        JOIN public.single_sales ss ON ss.id = cs.sale_id
        WHERE ss.paid_at IS NOT NULL
          AND a.package_appointment_id IS NULL
          AND a.payment_status IS DISTINCT FROM 'paid'
      ), '[]'::jsonb)
  ) INTO _result;
  RETURN _result;
END;
$function$;