ALTER TABLE public.single_sales ADD COLUMN IF NOT EXISTS sale_committed boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_single_sales_uncommitted ON public.single_sales (created_at) WHERE sale_committed = false;

CREATE OR REPLACE FUNCTION public.heal_uncommitted_sales()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN SELECT id FROM public.single_sales
    WHERE sale_committed = false AND created_at < now() - interval '10 minutes'
    LIMIT 50
  LOOP
    BEGIN
      PERFORM public.purge_single_sale_cascade(r.id);
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.heal_uncommitted_sales() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.heal_uncommitted_sales() TO authenticated;