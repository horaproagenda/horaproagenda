## Objetivo

Aproveitar tudo que o profissional digita no **cadastro** (Auth → signup) dentro de **Configurações → Informações da Clínica**, sem precisar redigitar. Endereço sempre puxado por CEP. Trocar e-mail/celular exige código de verificação enviado para o **e-mail atual**.

## 1. Banco (migration)

Adicionar colunas em `public.business_settings` (todas opcionais, texto):
- `clinic_cep`, `clinic_street`, `clinic_number`, `clinic_complement`, `clinic_neighborhood`, `clinic_city`, `clinic_state`
- `professional_name` (nome do profissional principal, separado do nome da clínica)

Manter `clinic_address` por compatibilidade (preencher automaticamente como string concatenada via trigger ou no save).

Em `public.professionals`: adicionar `cep`, `street`, `number`, `complement`, `neighborhood`, `city`, `state` (opcionais — endereço próprio se o profissional atende fora da clínica).

Tabela nova `public.contact_change_verifications` (RLS por `auth.uid()`): guarda código de 6 dígitos, tipo (`email` | `phone`), valor novo proposto, `expires_at` (10 min), `used_at`, `attempts`. GRANTs para `authenticated` e `service_role`.

## 2. Edge Functions

- **`send-contact-change-code`** (nova): recebe `{ type: 'email' | 'phone', newValue }`, gera código 6 dígitos, grava em `contact_change_verifications`, envia template `contact-change-code` para o e-mail **atual** do usuário autenticado. Rate-limit por usuário (60s cooldown, 5/h).
- **`verify-contact-change`** (nova): recebe `{ type, newValue, code }`, valida (não expirado, não usado, tentativas < 5). Em sucesso: atualiza `auth.users.email` (via admin) ou `profiles.phone` / `business_settings.clinic_phone`, marca `used_at`.
- Template React Email novo `_shared/transactional-email-templates/contact-change-code.tsx` (assunto: "Confirme a alteração da sua conta — Hora Pro").

## 3. Formulário de cadastro (`src/pages/Auth.tsx`)

Etapa `form` passa a coletar **tudo de uma vez** (todos obrigatórios, conforme escolha do usuário):

```text
Dados pessoais       Cadastro da clínica            Endereço
─────────────        ──────────────────             ────────
Nome completo*       Nome da clínica*               CEP* (busca ViaCEP)
CPF*                 Telefone da clínica*           Rua (auto)
E-mail (login)*      E-mail da clínica* (default    Número*
Senha*               = mesmo do login, editável)    Bairro (auto)
Confirmar senha*     CNPJ (opcional)                Cidade (auto)
                                                    Estado (auto)
                                                    Complemento (opcional)
```

CEP usa o helper existente `src/lib/viacep.ts` (`fetchAddressByCep`, `formatCep`). Ao perder foco/8 dígitos: preenche rua/bairro/cidade/UF e foca o campo "Número".

No envio (após verificação do código de e-mail), `signUp` passa todos esses campos via `userMetadata`. A edge `complete-signup` grava em `profiles` (nome/cpf/cnpj/telefone), cria a primeira linha de `business_settings` com os campos da clínica + endereço, e cria o primeiro `professionals` linkado ao `user_id` com o nome/telefone/e-mail.

## 4. Onboarding (`OnboardingWizard.tsx`)

Como o signup agora cobre tudo, o wizard só aparece para contas legadas sem `clinic_name`. Quando aparecer, vem **pré-preenchido** do `profile` / `business_settings` e do `auth.users.email`, mais o campo CEP com busca automática. Não duplicar perguntas que o signup já fez.

## 5. Configurações → Informações da Clínica (`src/pages/Configuracoes.tsx`)

Substituir o card atual por um layout com os mesmos campos do signup, na mesma ordem (dados, contato, endereço). Tudo carregado de `business_settings` + `profiles` (nome do profissional vem de `profile.full_name`).

Comportamento:
- Campos comuns (nome, clínica, CNPJ, endereço): editáveis e salvam direto.
- **E-mail** e **telefone do profissional**: campo com botão "Alterar". Ao clicar, abre um `Dialog` que pede o novo valor → dispara `send-contact-change-code` → mostra input de 6 dígitos → `verify-contact-change` confirma e atualiza. Toast e UI refletem imediatamente.
- CEP usa `fetchAddressByCep` e preenche rua/bairro/cidade/UF automaticamente, igual ao signup.

## 6. Cadastro de profissional (`admin-create-professional` + UI em Cadastros)

Adicionar opcionalmente os mesmos campos de endereço (CEP, rua, número, bairro, cidade, UF, complemento). Default = endereço da clínica (botão "Usar endereço da clínica" pré-preenche). Salva nas novas colunas de `professionals`.

## Detalhes técnicos

- ViaCEP já existe em `src/lib/viacep.ts` — reutilizar, sem nova dependência.
- Verificação reutiliza tabela e padrões existentes de `verification_codes` (mesmo formato 6 dígitos, mesmo TTL 10min). Tabela separada porque o destinatário muda (e-mail atual, não o novo).
- Hook novo `useContactChangeVerification` encapsula `send` + `verify` para reuso em Configurações e (futuramente) outras telas.
- `useBusinessSettings.ts` `select` é estendido com as novas colunas.
- Componente reutilizável `<AddressFieldsCep />` para evitar duplicar a lógica CEP entre signup, onboarding, configurações e cadastro de profissional.

## Fora do escopo

- SMS no celular (usuário escolheu código no e-mail para ambos).
- Geocoding/mapa.
- Múltiplas unidades da clínica.
