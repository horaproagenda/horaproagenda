-- Ensure mutable search_path warning is fixed for the remaining internal broadcast trigger
CREATE OR REPLACE FUNCTION public.messages_broadcast_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  PERFORM realtime.broadcast_changes(
    'room:' || COALESCE(NEW.room_id, OLD.room_id)::text,
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NEW,
    OLD
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Revoke direct API execution from internal SECURITY DEFINER functions.
-- Trigger functions and administrative helpers do not need to be callable by anon/authenticated clients.
REVOKE EXECUTE ON FUNCTION public.attach_document_trigger(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.attach_document_trigger_2(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_trigger_function() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.close_cash_register(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrease_product_stock_on_appointment_complete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_on_document_create() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_dml_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_package_appointment_history() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.messages_broadcast_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.preserve_package_original_session_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_payment_low(uuid, uuid, uuid, text, numeric, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_payment_low(uuid, uuid, uuid, text, numeric, text, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reconcile_sale_payment_trigger_fn() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_migration(text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.room_messages_broadcast_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.whatsapp_messages_broadcast_trigger() FROM PUBLIC, anon, authenticated;

-- Keep explicit grants only for intentionally public, token/registration-based pre-auth flows.
GRANT EXECUTE ON FUNCTION public.check_trial_eligibility(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_document_fill_link_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_document_fill_by_token(text, text, jsonb) TO anon, authenticated;