-- 1) Datas do ciclo de uso nos vínculos produto ↔ serviço / modelo de pacote
ALTER TABLE public.service_products
  ADD COLUMN IF NOT EXISTS usage_start_date date,
  ADD COLUMN IF NOT EXISTS usage_end_date date;

ALTER TABLE public.package_template_products
  ADD COLUMN IF NOT EXISTS usage_start_date date,
  ADD COLUMN IF NOT EXISTS usage_end_date date;

-- 2) Histórico de frascos em uso (um registro por frasco, nunca sobrescrito)
CREATE TABLE IF NOT EXISTS public.product_usage_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_id uuid NOT NULL DEFAULT public.current_account_owner_id(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  package_template_id uuid REFERENCES public.package_templates(id) ON DELETE SET NULL,
  calc_mode text NOT NULL DEFAULT 'manual',
  container_amount numeric NOT NULL,
  container_unit text NOT NULL,
  quantity_per_appointment numeric,
  avg_quantity_per_appointment numeric,
  start_date date NOT NULL,
  end_date date NOT NULL,
  appointments_counted integer NOT NULL DEFAULT 0,
  appointment_ids uuid[] NOT NULL DEFAULT '{}',
  total_consumed numeric,
  container_yield numeric,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_usage_records TO authenticated;
GRANT ALL ON public.product_usage_records TO service_role;

ALTER TABLE public.product_usage_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view product usage records"
  ON public.product_usage_records FOR SELECT TO authenticated
  USING (account_owner_id = public.current_account_owner_id() AND public.is_tenant_staff());

CREATE POLICY "Staff can insert product usage records"
  ON public.product_usage_records FOR INSERT TO authenticated
  WITH CHECK (account_owner_id = public.current_account_owner_id() AND public.is_tenant_staff());

CREATE POLICY "Staff can update product usage records"
  ON public.product_usage_records FOR UPDATE TO authenticated
  USING (account_owner_id = public.current_account_owner_id() AND public.is_tenant_staff())
  WITH CHECK (account_owner_id = public.current_account_owner_id() AND public.is_tenant_staff());

CREATE POLICY "Staff can delete product usage records"
  ON public.product_usage_records FOR DELETE TO authenticated
  USING (account_owner_id = public.current_account_owner_id() AND public.is_tenant_staff());

CREATE POLICY "block_super_admin_tenant_read_product_usage_records"
  ON public.product_usage_records FOR ALL TO authenticated
  USING (public.assert_not_super_admin_reading_tenant())
  WITH CHECK (public.assert_not_super_admin_reading_tenant());

CREATE INDEX IF NOT EXISTS idx_product_usage_records_product ON public.product_usage_records(product_id, start_date DESC);

CREATE TRIGGER trg_product_usage_records_updated_at
  BEFORE UPDATE ON public.product_usage_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.product_usage_records;