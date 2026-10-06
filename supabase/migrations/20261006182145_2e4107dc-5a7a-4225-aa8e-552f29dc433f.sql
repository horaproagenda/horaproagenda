DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname IN (
'attach_document_trigger','attach_document_trigger_2','audit_trigger_function','close_cash_register','confirm_verification_code','consume_signup_verification_grant','consume_verification_code','decrease_product_stock_on_appointment_complete','enqueue_on_document_create','get_professional_whatsapp_token','get_ultramsg_pool_assigned','get_ultramsg_pool_row','handle_new_user','heal_package_sales_payment','issue_verification_code','log_dml_changes','log_package_appointment_history','messages_broadcast_trigger','preserve_package_original_session_number','process_payment_low','reconcile_sale_payment_trigger_fn','record_migration','rls_auto_enable','room_messages_broadcast_trigger','seed_default_payment_methods','sync_package_sale_from_appointments','tg_sync_package_sale_on_payment','touch_signup_verification_grant','update_updated_at_column','whatsapp_messages_broadcast_trigger')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.sig);
  END LOOP;
END $$;