ALTER TABLE public.package_templates
ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS idx_package_templates_category
ON public.package_templates (category);