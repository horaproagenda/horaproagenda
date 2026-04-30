CREATE TABLE IF NOT EXISTS public.appointment_additional_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('service', 'product')),
  service_id uuid REFERENCES public.services(id),
  product_id uuid REFERENCES public.products(id),
  professional_id uuid REFERENCES public.professionals(id),
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  total_amount numeric NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointment_additional_items_item_ref_check CHECK (
    (item_type = 'service' AND service_id IS NOT NULL AND product_id IS NULL)
    OR
    (item_type = 'product' AND product_id IS NOT NULL AND service_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_appointment_additional_items_appointment_id
  ON public.appointment_additional_items(appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointment_additional_items_professional_id
  ON public.appointment_additional_items(professional_id);

ALTER TABLE public.appointment_additional_items ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_appointment_additional_item_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_professional_id uuid;
BEGIN
  SELECT professional_id INTO v_professional_id
  FROM public.appointments
  WHERE id = NEW.appointment_id;

  NEW.professional_id := COALESCE(NEW.professional_id, v_professional_id, public.get_professional_id_for_user(auth.uid()));
  NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  NEW.total_amount := COALESCE(NEW.total_amount, NEW.quantity * NEW.unit_price, 0);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_appointment_additional_item_defaults ON public.appointment_additional_items;
CREATE TRIGGER trg_set_appointment_additional_item_defaults
BEFORE INSERT OR UPDATE ON public.appointment_additional_items
FOR EACH ROW
EXECUTE FUNCTION public.set_appointment_additional_item_defaults();

CREATE POLICY "Admins and receptionists can manage appointment additional items"
ON public.appointment_additional_items
FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
);

CREATE POLICY "Professionals can view own appointment additional items"
ON public.appointment_additional_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = appointment_additional_items.appointment_id
      AND a.professional_id = public.get_professional_id_for_user(auth.uid())
  )
);

CREATE POLICY "Professionals can create own appointment additional items"
ON public.appointment_additional_items
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = appointment_additional_items.appointment_id
      AND a.professional_id = public.get_professional_id_for_user(auth.uid())
  )
);

CREATE POLICY "Professionals can update own appointment additional items"
ON public.appointment_additional_items
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = appointment_additional_items.appointment_id
      AND a.professional_id = public.get_professional_id_for_user(auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = appointment_additional_items.appointment_id
      AND a.professional_id = public.get_professional_id_for_user(auth.uid())
  )
);

CREATE POLICY "Professionals can delete own appointment additional items"
ON public.appointment_additional_items
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = appointment_additional_items.appointment_id
      AND a.professional_id = public.get_professional_id_for_user(auth.uid())
  )
);