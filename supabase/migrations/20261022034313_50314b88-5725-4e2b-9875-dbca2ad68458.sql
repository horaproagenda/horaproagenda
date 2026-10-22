ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS commission_type_snapshot text CHECK (commission_type_snapshot IN ('percentage','fixed')),
  ADD COLUMN IF NOT EXISTS commission_value_snapshot numeric CHECK (commission_value_snapshot IS NULL OR commission_value_snapshot >= 0);

-- Kit: comissão da etapa congelada ao criar o atendimento
CREATE OR REPLACE FUNCTION public.snapshot_kit_step_commission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c jsonb;
BEGIN
  IF NEW.composite_group_id IS NULL OR NEW.service_id IS NULL OR NEW.commission_type_snapshot IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT s.service_components -> (COALESCE(NEW.composite_sequence_order,1) - 1) INTO c
    FROM services s WHERE s.id = NEW.service_id AND jsonb_typeof(s.service_components) = 'array';
  IF c IS NOT NULL AND c->>'commission_type' IN ('percentage','fixed') THEN
    NEW.commission_type_snapshot := c->>'commission_type';
    NEW.commission_value_snapshot := COALESCE(NULLIF(c->>'commission_value','')::numeric, 0);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_snapshot_kit_step_commission ON public.appointments;
CREATE TRIGGER trg_snapshot_kit_step_commission BEFORE INSERT ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.snapshot_kit_step_commission();

-- Pacote sequencial: comissão da etapa congelada ao vincular o atendimento à sessão
CREATE OR REPLACE FUNCTION public.snapshot_package_step_commission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE st record;
BEGIN
  IF NEW.appointment_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.appointment_id IS NOT DISTINCT FROM OLD.appointment_id THEN RETURN NEW; END IF;
  SELECT pts.commission_type, pts.commission_value INTO st
    FROM service_packages sp
    JOIN package_template_steps pts ON pts.template_id = sp.template_id
     AND pts.sequence_order = COALESCE(NEW.sequence_order, NEW.session_number)
   WHERE sp.id = NEW.package_id;
  IF st.commission_type IN ('percentage','fixed') THEN
    UPDATE appointments
       SET commission_type_snapshot = st.commission_type,
           commission_value_snapshot = COALESCE(st.commission_value, 0)
     WHERE id = NEW.appointment_id AND commission_type_snapshot IS NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_snapshot_package_step_commission ON public.package_appointments;
CREATE TRIGGER trg_snapshot_package_step_commission AFTER INSERT OR UPDATE OF appointment_id ON public.package_appointments
FOR EACH ROW EXECUTE FUNCTION public.snapshot_package_step_commission();

REVOKE ALL ON FUNCTION public.snapshot_kit_step_commission() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.snapshot_package_step_commission() FROM PUBLIC, anon, authenticated;