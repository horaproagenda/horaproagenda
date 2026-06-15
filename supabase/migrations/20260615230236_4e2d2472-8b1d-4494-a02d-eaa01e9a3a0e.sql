-- Allow boleto release rules in service_packages.payment_type so the boleto sale flow
-- can persist the per-client package clone and the boleto sync can activate it.
ALTER TABLE public.service_packages DROP CONSTRAINT IF EXISTS service_packages_payment_type_check;
ALTER TABLE public.service_packages
  ADD CONSTRAINT service_packages_payment_type_check
  CHECK (payment_type = ANY (ARRAY['full'::text, 'per_session'::text, 'boleto_first_paid'::text, 'boleto_all_paid'::text]));