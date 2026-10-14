ALTER TABLE public.package_appointments ADD COLUMN display_session_number integer;
DO $fix$ DECLARE a public.appointments%ROWTYPE; before_entries jsonb; after_entries jsonb; times jsonb; times_after jsonb; r record; n int:=0; BEGIN
 SELECT * INTO a FROM public.appointments WHERE id='5662d2d2-1730-4c08-928e-7fd1e1166347' FOR UPDATE;
 IF a.client_id<>'08196b19-de51-400b-be6a-849d1d621e99' OR a.package_appointment_id<>'12f96cdf-635d-4552-8948-5aa30c1602b3' OR a.start_time<>'2026-08-19 21:00:00+00'::timestamptz THEN RAISE EXCEPTION 'Historical correction precondition failed'; END IF;
 SELECT jsonb_agg(jsonb_build_object('id',id,'amount',amount,'paid_date',paid_date,'status',status,'method',payment_method_id,'sale',sale_id) ORDER BY id) INTO before_entries FROM public.financial_entries WHERE sale_id='4fc21a32-4e6e-46b2-a649-e6e245a1d54f';
 SELECT jsonb_agg(jsonb_build_object('id',id,'start',start_time,'end',end_time,'status',status,'service',service_id) ORDER BY id) INTO times FROM public.appointments WHERE client_id=a.client_id;
 PERFORM set_config('app.skip_rebuild_pa','1',true);
 PERFORM set_config('app.skip_package_interval_cascade','on',true);
 UPDATE public.financial_entries SET appointment_id=NULL WHERE appointment_id=a.id AND sale_id='4fc21a32-4e6e-46b2-a649-e6e245a1d54f';
 UPDATE public.appointments SET package_appointment_id=NULL,package_name_snapshot=NULL,amount_paid=0,payment_date=NULL,payment_methods=NULL,payment_status='pending' WHERE id=a.id;
 -- Origin is immutable for all callers; set the proven historical origin in this migration only.
 ALTER TABLE public.appointments DISABLE TRIGGER zz_guard_appointment_package_origin;
 UPDATE public.appointments SET booking_origin='standalone',package_name_snapshot=NULL WHERE id=a.id;
 ALTER TABLE public.appointments ENABLE TRIGGER zz_guard_appointment_package_origin;
 UPDATE public.package_appointments SET appointment_id=NULL,scheduled_date=NULL,status='pending' WHERE id='12f96cdf-635d-4552-8948-5aa30c1602b3';
 FOR r IN SELECT pa.id FROM public.package_appointments pa LEFT JOIN public.appointments ap ON ap.id=pa.appointment_id WHERE pa.package_id='ea20a5ef-6da7-436b-b56d-dfc2186810e3' ORDER BY (pa.appointment_id IS NULL),ap.start_time NULLS LAST,pa.original_session_number LOOP
 n:=n+1; UPDATE public.package_appointments SET display_session_number=n WHERE id=r.id;
 END LOOP;
 PERFORM public.recount_service_package_sessions('ea20a5ef-6da7-436b-b56d-dfc2186810e3');
 INSERT INTO public.package_appointment_history(package_appointment_id,package_id,appointment_id,previous_scheduled_date,new_scheduled_date,previous_status,new_status,change_reason,metadata,account_owner_id) VALUES ('12f96cdf-635d-4552-8948-5aa30c1602b3','ea20a5ef-6da7-436b-b56d-dfc2186810e3',a.id,a.start_time,NULL,'completed','pending','Correção autorizada: atendimento avulso anterior à contratação não pertence ao pacote.',jsonb_build_object('previous_appointment',to_jsonb(a)-'confirmation_token','preserved_sale_id','4fc21a32-4e6e-46b2-a649-e6e245a1d54f','preserved_payment',before_entries),a.account_owner_id);
 SELECT jsonb_agg(jsonb_build_object('id',id,'amount',amount,'paid_date',paid_date,'status',status,'method',payment_method_id,'sale',sale_id) ORDER BY id) INTO after_entries FROM public.financial_entries WHERE sale_id='4fc21a32-4e6e-46b2-a649-e6e245a1d54f';
 SELECT jsonb_agg(jsonb_build_object('id',id,'start',start_time,'end',end_time,'status',status,'service',service_id) ORDER BY id) INTO times_after FROM public.appointments WHERE client_id=a.client_id;
 IF times IS DISTINCT FROM times_after OR before_entries IS DISTINCT FROM after_entries OR n<>15 THEN RAISE EXCEPTION 'Preservation check failed'; END IF;
 END $fix$;