ALTER TABLE public.package_templates
ADD COLUMN IF NOT EXISTS package_type text NOT NULL DEFAULT 'standard';

CREATE TABLE IF NOT EXISTS public.package_template_steps (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id uuid NOT NULL,
  service_id uuid NOT NULL,
  sequence_order integer NOT NULL,
  interval_after_days integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (template_id, sequence_order)
);

ALTER TABLE public.package_template_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view package template steps" ON public.package_template_steps;
CREATE POLICY "Authenticated users can view package template steps"
ON public.package_template_steps
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Admins can insert package template steps" ON public.package_template_steps;
CREATE POLICY "Admins can insert package template steps"
ON public.package_template_steps
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update package template steps" ON public.package_template_steps;
CREATE POLICY "Admins can update package template steps"
ON public.package_template_steps
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete package template steps" ON public.package_template_steps;
CREATE POLICY "Admins can delete package template steps"
ON public.package_template_steps
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_package_template_steps_template_sequence
ON public.package_template_steps(template_id, sequence_order);

CREATE INDEX IF NOT EXISTS idx_package_template_steps_service_id
ON public.package_template_steps(service_id);

DROP TRIGGER IF EXISTS update_package_template_steps_updated_at ON public.package_template_steps;
CREATE TRIGGER update_package_template_steps_updated_at
BEFORE UPDATE ON public.package_template_steps
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();