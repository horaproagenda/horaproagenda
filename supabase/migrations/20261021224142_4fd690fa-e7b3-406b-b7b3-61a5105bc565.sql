DO $$
DECLARE r record;
  names text[] := ARRAY['activate_product_usage','appointment_has_conflict','audit_package_session_integrity','backfill_reset_unbacked_paid_appointments','can_access_package_appointment','cascade_package_intervals_after_anchor','check_trial_eligibility','claim_ultramsg_pool_instance','confirmar_codigo_whatsapp','corrigir_agendamentos_duplicados','create_product_usage_plan','enforce_temp_password_column_privileges','ensure_admin_professional','expire_old_temp_passwords','find_package_session_for_appointment','finish_product_usage_cycle','get_account_owner','get_financial_entry_root','get_product_ledger','get_professional_temp_password','get_whatsapp_unit_price','heal_package_service_links','heal_phantom_package_sessions','is_account_active','is_boleto_installment_sale','list_account_seat_usage_admin','list_all_accounts_admin','my_employment_type','perm_scope','professional_share_flag','purge_my_account_test_data','rebuild_package_appointments','reconcile_product_purchase_totals','recount_service_package_sessions','repair_package_cancelled_history','repair_sequential_package_steps','security_check_temp_password_protected','seed_default_document_templates','set_ultramsg_pool_token','super_admin_approve_whatsapp_release','super_admin_list_pending_whatsapp_releases','super_admin_revoke_whatsapp_release','sync_appointments_with_paid_sale','sync_product_purchase_finance','sync_recurring_session_notes','tg_enforce_sensitive_column_privileges'];
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.prosecdef AND p.proname = ANY(names) LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

REVOKE ALL ON public.pricing_cache FROM anon, authenticated;
REVOKE ALL ON public.contact_change_verifications FROM anon, authenticated;
GRANT ALL ON public.pricing_cache, public.contact_change_verifications TO service_role;
COMMENT ON TABLE public.pricing_cache IS 'Server-only (service_role). RLS without policies is intentional.';
COMMENT ON TABLE public.contact_change_verifications IS 'Server-only (service_role). RLS without policies is intentional.';

CREATE OR REPLACE FUNCTION public.log_document_event(p_token text, p_event text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_link public.document_fill_links%ROWTYPE;
BEGIN
  IF p_event NOT IN ('link_opened','preview_generated','preview_validated','preview_rejected') THEN RETURN; END IF;
  IF p_token IS NULL OR length(p_token) > 200 THEN RETURN; END IF;
  IF p_payload IS NOT NULL AND length(p_payload::text) > 4000 THEN p_payload := '{}'::jsonb; END IF;
  SELECT * INTO v_link FROM public.document_fill_links WHERE token = p_token LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO public.document_events(link_id, account_owner_id, event_type, payload)
  VALUES (v_link.id, v_link.account_owner_id, p_event, COALESCE(p_payload, '{}'::jsonb) - 'value');
END $function$;