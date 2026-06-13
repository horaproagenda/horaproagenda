
-- 1) Add category column to document_templates
ALTER TABLE public.document_templates
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'anamnese';

ALTER TABLE public.document_templates
  DROP CONSTRAINT IF EXISTS document_templates_category_check;
ALTER TABLE public.document_templates
  ADD CONSTRAINT document_templates_category_check
  CHECK (category IN ('anamnese','contract','consent'));

-- 2) Backfill based on title
UPDATE public.document_templates
SET category = CASE
  WHEN lower(title) LIKE '%anamnese%' THEN 'anamnese'
  WHEN lower(title) LIKE '%contrato%' THEN 'contract'
  WHEN lower(title) LIKE '%termo%' OR lower(title) LIKE '%consent%' THEN 'consent'
  ELSE 'anamnese'
END
WHERE category = 'anamnese';

-- 3) Add 'consent' to document_type enum (for client_documents.type)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'document_type' AND e.enumlabel = 'consent'
  ) THEN
    ALTER TYPE public.document_type ADD VALUE 'consent';
  END IF;
END $$;
