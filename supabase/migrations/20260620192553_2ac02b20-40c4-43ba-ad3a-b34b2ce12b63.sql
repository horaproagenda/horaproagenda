
-- 1) Trigger function: keeps products and product_purchases in sync
CREATE OR REPLACE FUNCTION public.sync_product_active_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_close_date DATE;
BEGIN
  -- Case A: this row became (or remains) the active cycle
  IF NEW.started_using_at IS NOT NULL AND NEW.finished_at IS NULL THEN
    v_close_date := (NEW.started_using_at - INTERVAL '1 day')::date;

    -- Close any other active purchases for this product
    UPDATE public.product_purchases
       SET finished_at = GREATEST(started_using_at, v_close_date)
     WHERE product_id = NEW.product_id
       AND id <> NEW.id
       AND started_using_at IS NOT NULL
       AND finished_at IS NULL;

    -- Mirror onto the product itself
    UPDATE public.products
       SET started_using_at = NEW.started_using_at,
           finished_at = NULL
     WHERE id = NEW.product_id
       AND (started_using_at IS DISTINCT FROM NEW.started_using_at
            OR finished_at IS NOT NULL);

  -- Case B: this row got closed (started + finished both set)
  ELSIF NEW.started_using_at IS NOT NULL AND NEW.finished_at IS NOT NULL THEN
    -- Only mirror finished_at if there is no other active purchase
    IF NOT EXISTS (
      SELECT 1 FROM public.product_purchases
       WHERE product_id = NEW.product_id
         AND id <> NEW.id
         AND started_using_at IS NOT NULL
         AND finished_at IS NULL
    ) THEN
      UPDATE public.products
         SET finished_at = NEW.finished_at
       WHERE id = NEW.product_id
         AND started_using_at = NEW.started_using_at
         AND (finished_at IS DISTINCT FROM NEW.finished_at);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_product_active_cycle_ins ON public.product_purchases;
DROP TRIGGER IF EXISTS sync_product_active_cycle_upd ON public.product_purchases;

CREATE TRIGGER sync_product_active_cycle_ins
AFTER INSERT ON public.product_purchases
FOR EACH ROW EXECUTE FUNCTION public.sync_product_active_cycle();

CREATE TRIGGER sync_product_active_cycle_upd
AFTER UPDATE OF started_using_at, finished_at ON public.product_purchases
FOR EACH ROW EXECUTE FUNCTION public.sync_product_active_cycle();

-- 2) One-time cleanup: close duplicate active purchases (keep most recent active per product)
WITH ranked AS (
  SELECT id, product_id, started_using_at,
         ROW_NUMBER() OVER (
           PARTITION BY product_id
           ORDER BY started_using_at DESC, created_at DESC
         ) AS rn,
         LAG(started_using_at) OVER (
           PARTITION BY product_id
           ORDER BY started_using_at DESC, created_at DESC
         ) AS newer_start
  FROM public.product_purchases
  WHERE started_using_at IS NOT NULL AND finished_at IS NULL
)
UPDATE public.product_purchases pp
   SET finished_at = GREATEST(pp.started_using_at, (r.newer_start - INTERVAL '1 day')::date)
  FROM ranked r
 WHERE pp.id = r.id
   AND r.rn > 1
   AND r.newer_start IS NOT NULL;

-- 3) One-time cleanup: align products with their current active purchase
WITH active AS (
  SELECT DISTINCT ON (product_id) product_id, started_using_at
  FROM public.product_purchases
  WHERE started_using_at IS NOT NULL AND finished_at IS NULL
  ORDER BY product_id, started_using_at DESC, created_at DESC
)
UPDATE public.products p
   SET started_using_at = a.started_using_at,
       finished_at = NULL
  FROM active a
 WHERE p.id = a.product_id
   AND (p.started_using_at IS DISTINCT FROM a.started_using_at
        OR p.finished_at IS NOT NULL);
