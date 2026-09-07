DROP POLICY IF EXISTS "Authenticated can read billing payment links" ON public.billing_payment_links;

ALTER TABLE public.billing_payment_links ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.billing_payment_links FROM anon;
GRANT SELECT ON public.billing_payment_links TO authenticated;
GRANT ALL ON public.billing_payment_links TO service_role;

CREATE POLICY "Admins read billing payment links"
ON public.billing_payment_links
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

CREATE POLICY "Only admins may read billing payment links"
ON public.billing_payment_links
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);