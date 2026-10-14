UPDATE public.single_sales
   SET discount_amount = 400, final_amount = 1800, original_amount = 2200
 WHERE id = '045dcacb-dc0d-4229-805b-9dee7d810db6' AND final_amount = 2200 AND discount_amount = 0;

UPDATE public.financial_entries
   SET sale_id = '045dcacb-dc0d-4229-805b-9dee7d810db6', original_amount = 2200
 WHERE id = '1f72f179-c6c4-43f1-b4c3-e99cacd55b40' AND sale_id IS NULL AND amount = 1800;

UPDATE public.appointments
   SET amount_paid = 1800
 WHERE package_appointment_id IN (
   SELECT pa.id FROM public.package_appointments pa
   JOIN public.single_sales s ON s.package_id = pa.package_id
   WHERE s.id = '045dcacb-dc0d-4229-805b-9dee7d810db6')
   AND amount_paid = 2200 AND discount_amount = 400;