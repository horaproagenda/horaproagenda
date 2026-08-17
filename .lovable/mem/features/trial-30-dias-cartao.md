---
name: Teste gratuito de 30 dias com cartão obrigatório
description: Regras do trial de 30 dias no Stripe (cartão salvo, cobrança automática, elegibilidade única) e assentos por plano
type: feature
---

- Novo usuário tem **30 dias grátis**, concedidos apenas no Stripe Checkout (`create-checkout` → `subscription_data.trial_period_days: 30`).
- Cartão é **obrigatório**: `payment_method_collection: 'always'` + `trial_settings.end_behavior.missing_payment_method: 'cancel'`. Ao fim dos 30 dias a cobrança é automática.
- Elegibilidade decidida **no servidor** (`isTrialEligible` em `create-checkout`): sem teste para quem já tem `stripe_subscription_id`, já pagou (`trial_registrations.has_paid`), é vitalício, está em blocklist, ou já teve qualquer assinatura no Stripe.
- Pix/Boleto não têm trial (não permitem cobrança automática).
- `stripe-webhook` e `check-subscription` mapeiam `trialing` → `status: 'trial'` e gravam `trial_ends_at` (= `trial_end` do Stripe). `seat_limit` = quantity do plano, já válido durante o teste.
- Frontend: `useAccountSubscription` expõe `isTrialing`, `trialDaysLeft`, `trialEligible`; `TrialBanner` mostra dias restantes e data da cobrança.
