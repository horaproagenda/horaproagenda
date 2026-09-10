ALTER TABLE public.account_subscriptions
  DROP CONSTRAINT IF EXISTS account_subscriptions_status_check;

ALTER TABLE public.account_subscriptions
  ADD CONSTRAINT account_subscriptions_status_check
  CHECK (status IN ('pending', 'trial', 'active', 'past_due', 'canceled', 'grandfathered', 'suspended'));

COMMENT ON CONSTRAINT account_subscriptions_status_check ON public.account_subscriptions IS
  'Statuses supported by signup, trial, Asaas billing, grace-period suspension, cancellation, and grandfathered accounts.';