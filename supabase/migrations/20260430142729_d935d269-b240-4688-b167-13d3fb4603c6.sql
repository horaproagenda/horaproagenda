
-- Add sequential register_number column
ALTER TABLE public.cash_registers
ADD COLUMN register_number INTEGER;

-- Backfill existing registers with sequential numbers based on opened_at order
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY opened_at ASC) AS rn
  FROM public.cash_registers
)
UPDATE public.cash_registers cr
SET register_number = numbered.rn
FROM numbered
WHERE cr.id = numbered.id;

-- Make it NOT NULL after backfill
ALTER TABLE public.cash_registers
ALTER COLUMN register_number SET NOT NULL;

-- Create function to auto-assign next register_number
CREATE OR REPLACE FUNCTION public.set_cash_register_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  SELECT COALESCE(MAX(register_number), 0) + 1
  INTO NEW.register_number
  FROM public.cash_registers;
  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER trg_set_cash_register_number
BEFORE INSERT ON public.cash_registers
FOR EACH ROW
EXECUTE FUNCTION public.set_cash_register_number();
