
DO $$
BEGIN
  SET LOCAL session_replication_role = 'replica';
  DELETE FROM public.appointments WHERE account_owner_id='4d3364c7-65dc-4dfe-9c5f-f85f599e32dc';
  DELETE FROM public.financial_entries WHERE account_owner_id='4d3364c7-65dc-4dfe-9c5f-f85f599e32dc';
  DELETE FROM public.services WHERE account_owner_id='4d3364c7-65dc-4dfe-9c5f-f85f599e32dc';
  DELETE FROM public.clients WHERE account_owner_id='4d3364c7-65dc-4dfe-9c5f-f85f599e32dc';
END $$;
