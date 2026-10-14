DO $fix$ DECLARE a record; t jsonb; ta jsonb; BEGIN
 SELECT * INTO a FROM public.appointments WHERE id='4ee7cce4-66ec-4c01-bd44-2ed65f99fe5c' FOR UPDATE;
 IF a.created_at>='2026-08-27'::timestamptz OR a.package_appointment_id<>'b3208295-3bec-4e97-ad47-a7c3d500afb3' THEN RAISE EXCEPTION 'Historical evidence mismatch'; END IF;
 SELECT jsonb_agg(jsonb_build_object('id',id,'start',start_time,'end',end_time,'status',status,'service',service_id) ORDER BY id) INTO t FROM public.appointments WHERE client_id=a.client_id;
 PERFORM set_config('app.skip_rebuild_pa','1',true); PERFORM set_config('app.skip_package_interval_cascade','on',true);
 UPDATE public.appointments SET package_appointment_id=NULL,package_name_snapshot=NULL WHERE id=a.id;
 ALTER TABLE public.appointments DISABLE TRIGGER zz_guard_appointment_package_origin;
 UPDATE public.appointments SET booking_origin='standalone',package_name_snapshot=NULL WHERE id=a.id;
 ALTER TABLE public.appointments ENABLE TRIGGER zz_guard_appointment_package_origin;
 UPDATE public.package_appointments SET appointment_id=NULL,status='pending',scheduled_date=NULL WHERE id='b3208295-3bec-4e97-ad47-a7c3d500afb3';
 UPDATE public.appointments SET package_name_snapshot=NULL WHERE id='5662d2d2-1730-4c08-928e-7fd1e1166347';
 PERFORM public.recount_service_package_sessions('ea20a5ef-6da7-436b-b56d-dfc2186810e3');
 INSERT INTO public.package_appointment_history(package_appointment_id,package_id,appointment_id,previous_scheduled_date,previous_status,new_status,change_reason,metadata,account_owner_id) VALUES('b3208295-3bec-4e97-ad47-a7c3d500afb3','ea20a5ef-6da7-436b-b56d-dfc2186810e3',a.id,a.start_time,a.status::text,'pending','Correção de vínculo automático: atendimento cadastrado antes da compra do pacote.',jsonb_build_object('previous_origin',a.booking_origin,'previous_link',a.package_appointment_id,'preserved_start',a.start_time,'preserved_status',a.status),a.account_owner_id);
 SELECT jsonb_agg(jsonb_build_object('id',id,'start',start_time,'end',end_time,'status',status,'service',service_id) ORDER BY id) INTO ta FROM public.appointments WHERE client_id=a.client_id;
 IF t IS DISTINCT FROM ta THEN RAISE EXCEPTION 'Appointment preservation failed'; END IF;
 END $fix$;