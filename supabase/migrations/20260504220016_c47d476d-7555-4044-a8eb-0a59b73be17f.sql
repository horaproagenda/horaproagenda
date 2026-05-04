
-- Add per-professional and offset fields to whatsapp_templates
ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS professional_id uuid REFERENCES public.professionals(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS send_offset_hours integer;

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_professional ON public.whatsapp_templates(professional_id);

-- Refresh RLS so professionals only see their own + global templates
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wt_select" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "wt_insert" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "wt_update" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "wt_delete" ON public.whatsapp_templates;

CREATE POLICY "wt_select" ON public.whatsapp_templates
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  OR professional_id IS NULL
  OR professional_id = public.get_professional_id_for_user(auth.uid())
);

CREATE POLICY "wt_insert" ON public.whatsapp_templates
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  OR professional_id = public.get_professional_id_for_user(auth.uid())
);

CREATE POLICY "wt_update" ON public.whatsapp_templates
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  OR professional_id = public.get_professional_id_for_user(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  OR professional_id = public.get_professional_id_for_user(auth.uid())
);

CREATE POLICY "wt_delete" ON public.whatsapp_templates
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  OR professional_id = public.get_professional_id_for_user(auth.uid())
);

-- Default reminder provider to evolution whatsapp
UPDATE public.business_settings SET reminder_provider = 'whatsapp' WHERE reminder_provider IS DISTINCT FROM 'whatsapp';
