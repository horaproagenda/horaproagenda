SET LOCAL lock_timeout = '8s';
CREATE OR REPLACE FUNCTION public.can_see_all_appointments()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN true; END IF;
  IF public.is_account_admin(auth.uid()) THEN RETURN true; END IF;
  IF public.perm('agenda', 'view_others') THEN RETURN true; END IF;
  RETURN public.get_professional_id_for_user(auth.uid()) IS NULL;
END; $$;
REVOKE EXECUTE ON FUNCTION public.can_see_all_appointments() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_all_appointments() TO authenticated, service_role;

DO $$
DECLARE r record; q text; c text; tbl text;
BEGIN
  FOR tbl IN SELECT DISTINCT tablename FROM pg_policies WHERE schemaname='public' ORDER BY tablename LOOP
    EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE', tbl);
  END LOOP;
  FOR r IN SELECT schemaname, tablename, policyname, qual, with_check FROM pg_policies WHERE schemaname='public' LOOP
    q := r.qual; c := r.with_check;
    IF q IS NOT NULL THEN
      q := regexp_replace(q, 'can_see_appointment_row\((\w+)\)', '((SELECT can_see_all_appointments()) OR \1 IS NULL OR \1 = (SELECT get_professional_id_for_user(auth.uid())))', 'g');
      q := regexp_replace(q, '((public\.)?(current_account_owner_id|assert_not_super_admin_reading_tenant)\(\))', '(SELECT \1)', 'g');
      q := regexp_replace(q, '((public\.)?(has_role|get_professional_id_for_user|is_account_admin|is_super_admin)\(auth\.uid\(\)(, ''\w+''::app_role)?\))', '(SELECT \1)', 'g');
      q := replace(q, '(SELECT (SELECT ', '((SELECT ');
    END IF;
    IF c IS NOT NULL THEN
      c := regexp_replace(c, '((public\.)?(current_account_owner_id|assert_not_super_admin_reading_tenant)\(\))', '(SELECT \1)', 'g');
      c := regexp_replace(c, '((public\.)?(has_role|get_professional_id_for_user|is_account_admin|is_super_admin)\(auth\.uid\(\)(, ''\w+''::app_role)?\))', '(SELECT \1)', 'g');
      c := replace(c, '(SELECT (SELECT ', '((SELECT ');
    END IF;
    IF q IS DISTINCT FROM r.qual THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)', r.policyname, r.schemaname, r.tablename, q);
    END IF;
    IF c IS DISTINCT FROM r.with_check THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)', r.policyname, r.schemaname, r.tablename, c);
    END IF;
  END LOOP;
END $$;