---
name: Avisos no celular (Web Push)
description: Avisos do PWA para profissionais — novos agendamentos, confirmações, cancelamentos e lembretes, com antiduplicidade e toggles por tipo
type: feature
---

Avisos nativos do aparelho (Web Push, sem Firebase), funcionam com o app fechado.

- Chaves VAPID nos segredos: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
  Criptografia aes128gcm implementada à mão em `supabase/functions/_shared/webpush.ts` (Web Crypto, sem dependência npm).
- Edge function única `push-dispatch` com modos: `config` (chave pública), `event`
  (chamado pelo trigger `trg_push_appointment_insert` / `trg_push_appointment_status` via pg_net),
  `reminders` (cron `push-reminders-scan`, a cada 5 min, header `x-cron-secret` = `PUSH_CRON_SECRET`),
  `test` (aviso de teste do próprio usuário).
- Antiduplicidade em 3 camadas: `push_notification_log` (UNIQUE user_id+dedupe_key),
  `tag` na notificação do sistema operacional e TTL de 12h no envio.
- `push_subscriptions` guarda os aparelhos (RLS: só o próprio usuário); endpoints com 404/410 são apagados.
- Preferências em `professional_preferences`: `push_enabled`, `push_appointment_new`,
  `push_appointment_confirmed`, `push_appointment_cancelled`, `push_reminders`.
- Frontend: `src/lib/pushNotifications.ts`, painel `AvisosCelularSettings` em Configurações,
  handlers em `public/push-listener.js` (injetado no SW via `workbox.importScripts`).
- iPhone/iPad só recebem avisos depois de salvar o app na tela inicial (regra da Apple) —
  a interface avisa isso em vez de falhar.
- Lembretes notificados são os da página `/lembretes`, sempre só para quem os criou.
