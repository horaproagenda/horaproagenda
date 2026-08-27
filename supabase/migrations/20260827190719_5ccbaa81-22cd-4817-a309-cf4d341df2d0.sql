CREATE OR REPLACE FUNCTION public.heal_orphan_service_packages()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _owner uuid := auth.uid();
  _pkg RECORD;
  _deleted_packages int := 0;
  _package_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  -- IMPORTANTE (regressão protegida): esta rotina roda em segundo plano.
  -- Ela NUNCA pode apagar um pacote que tenha qualquer agendamento vinculado,
  -- nem pacotes recém-criados. Pacotes criados direto pela agenda não possuem
  -- venda no Caixa e antes eram apagados junto com todos os agendamentos.
  FOR _pkg IN
    SELECT p.id
    FROM public.service_packages p
    WHERE p.client_id IS NOT NULL
      AND (p.account_owner_id = _owner OR _owner IS NULL)
      AND p.created_at < now() - interval '24 hours'
      AND COALESCE(p.sessions_scheduled, 0) = 0
      AND NOT EXISTS (SELECT 1 FROM public.single_sales s WHERE s.package_id = p.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.package_appointments pa
        WHERE pa.package_id = p.id
          AND pa.appointment_id IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.package_appointments pa
        WHERE pa.package_id = p.id
          AND pa.status IN ('completed', 'scheduled')
      )
  LOOP
    DELETE FROM public.package_appointment_history WHERE package_id = _pkg.id;
    DELETE FROM public.package_appointments WHERE package_id = _pkg.id;
    DELETE FROM public.service_packages WHERE id = _pkg.id;
    _deleted_packages := _deleted_packages + 1;
    _package_ids := _package_ids || _pkg.id;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_packages', _deleted_packages,
    'package_ids', to_jsonb(_package_ids)
  );
END;
$function$;