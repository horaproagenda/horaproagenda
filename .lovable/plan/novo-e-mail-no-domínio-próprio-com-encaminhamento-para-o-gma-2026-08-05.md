# Novo e-mail no domínio próprio (com encaminhamento para o Gmail)

## Novo endereço

**suporte@horaproagenda.app**

Ele será apenas uma "porta de entrada" no seu domínio: todo e-mail recebido nele será **encaminhado automaticamente para horaproagenda@gmail.com**, então você continua lendo e respondendo tudo do mesmo Gmail de hoje.

Alternativas caso prefira outra palavra: `contato@horaproagenda.app` ou `atendimento@horaproagenda.app`.

## O que muda

1. **Criação do encaminhamento (feito por você, fora do app)**
   No provedor do domínio `horaproagenda.app`, criar o encaminhamento de `suporte@horaproagenda.app` para `horaproagenda@gmail.com` (registros MX do serviço de forwarding). Se o domínio foi comprado pela Lovable, isso é feito em Configurações do Projeto → Domínios → ⋯ Configurar → Gerenciar registros DNS.
   Importante: os registros MX ficam no domínio raiz `horaproagenda.app` e **não conflitam** com o subdomínio de envio já verificado (`notify.agendalume.app`).
   Opcional: no Gmail, adicionar `suporte@horaproagenda.app` como "Enviar e-mail como" para responder com o endereço do domínio.

2. **Atualização no Stripe (feito por você no painel do Stripe)**
   No Stripe Dashboard → Configurações → Empresa/Conta pública: trocar o e-mail de suporte para `suporte@horaproagenda.app`. Isso atende à exigência do Stripe de e-mail no mesmo domínio do site.

3. **Atualização no aplicativo (eu faço)**
   Passar todas as telas e e-mails a exibir o novo endereço, mantendo o Gmail apenas como destino real via encaminhamento.

## Detalhes técnicos

- `src/content/brand.ts`: `email` e `supportEmail` → `suporte@horaproagenda.app` (fonte única já usada por várias telas).
- Substituir as ocorrências fixas de `horaproagenda@gmail.com` por `BRAND.supportEmail` em:
  - `src/pages/Suporte.tsx`, `src/pages/Ajuda.tsx`
  - `src/pages/PoliticaDePrivacidade.tsx`, `src/pages/TermosDeServico.tsx`
  - `src/components/auth/AuthErrorBoundary.tsx`
  - `src/components/super-admin/NewSignupsPanel.tsx`
- Notificações internas (novo cadastro e leads de interesse) passam a ir para o novo endereço:
  - `supabase/functions/_shared/transactional-email-templates/new-signup-notification.tsx`
  - `supabase/functions/_shared/transactional-email-templates/interest-lead-notification.tsx`
  - redeploy de `send-transactional-email`.
- O remetente dos e-mails enviados pelo sistema (`noreply@…`) continua como está — este ajuste é só do e-mail de contato/suporte.

## Após a aprovação

Eu aplico as mudanças no app e te entrego um checklist curto com os dois passos externos (DNS de encaminhamento e Stripe).
