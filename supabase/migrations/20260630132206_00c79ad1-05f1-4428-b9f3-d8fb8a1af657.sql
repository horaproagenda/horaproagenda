-- 1. Remove sensitive tables from Realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.account_subscriptions;
ALTER PUBLICATION supabase_realtime DROP TABLE public.interest_leads;

-- 2. Tighten account_subscriptions SELECT to owner only (defense in depth)
DROP POLICY IF EXISTS "Owner pode ler sua assinatura" ON public.account_subscriptions;
CREATE POLICY "Owner pode ler sua assinatura"
ON public.account_subscriptions
FOR SELECT
TO authenticated
USING (owner_user_id = auth.uid());

-- 3. Add explicit write policies for user_permissions (admin-managed)
CREATE POLICY "Admin can insert permissions"
ON public.user_permissions
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can update permissions"
ON public.user_permissions
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can delete permissions"
ON public.user_permissions
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));