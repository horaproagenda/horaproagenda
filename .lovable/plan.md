# Auto-cadastro de Cliente via Link Público

## Visão geral

Adicionar fluxo onde a profissional, no botão "Novo Cliente", escolhe entre:
1. **Cadastro manual** (fluxo atual `NewClientDialog`)
2. **Cliente faz o próprio cadastro** → gera link público (semelhante ao link de preenchimento de documentos) que o cliente abre no celular/PC e preenche todos os dados.

Após envio, o cliente aparece em `/clientes` com badge **"Cadastro feito via link"** e os documentos preenchidos vão para o perfil do cliente em Documentos.

## Backend (Supabase)

### Nova tabela `client_registration_links`
- `id`, `token` (text único), `professional_id` (FK, obrigatório — profissional responsável atribuído)
- `template_ids` (uuid[]) — documentos opcionais a preencher no cadastro
- `expires_at`, `created_by`, `created_at`, `used_at`, `created_client_id`
- `single_use` (boolean, default false) — link pode ser reutilizável

GRANTs: `authenticated` (CRUD), `service_role` (ALL). RLS: profissional vê os seus próprios; admin/recepção vê todos.

### Edge Function pública `submit-client-registration`
- `verify_jwt = false` (acesso público via token)
- Valida token e expiração
- Valida payload com Zod: nome, telefone (único), CPF válido (PF) ou CNPJ (PJ), email, nascimento, endereço completo, observações, person_type ('pf'|'pj')
- Reaproveita validador de CPF e ViaCEP (frontend já valida CEP)
- Checa duplicidade de telefone/CPF/CNPJ no `clients`
- Cria cliente com `assigned_professional_id` do link, `referral_source`, `notes`, endereço completo
- Marca origem: campo novo `registration_source` ('manual' | 'self_link') no `clients`
- Se `template_ids` definidos: cria `client_documents` preenchidos (reaproveitando lógica de `submit_document_fill_by_token` para gerar PDF posterior e assinatura Gov.br no fluxo já existente)
- Marca `client_registration_links.used_at` e `created_client_id`

### Migração adicional
- `ALTER TABLE clients ADD COLUMN registration_source text DEFAULT 'manual'`
- Unicidade já existente: telefone único validado em edge function

## Frontend

### 1. `NewClientDialog` (modificação)
Ao clicar "Novo Cliente" abre um **seletor de modo**:
- "Cadastrar manualmente" → fluxo atual
- "Enviar link para o cliente preencher" → abre `GenerateRegistrationLinkDialog`

### 2. Novo `GenerateRegistrationLinkDialog.tsx`
Campos:
- Profissional responsável (Searchable Select; default = profissional logado se aplicável)
- Documentos a serem preenchidos (multi-select de `document_templates`, opcional)
- Validade (padrão 7 dias)
- Botão "Gerar link" → cria registro em `client_registration_links`, mostra link `https://.../cadastro-cliente/:token`, com botões Copiar e Compartilhar WhatsApp

### 3. Nova página pública `/cadastro-cliente/:token`
- Rota pública (sem auth) em `App.tsx`
- Carrega link via função pública (RPC `get_client_registration_link_by_token`) — retorna profissional, documentos e validade
- Tabs: **Pessoa Física** | **Pessoa Jurídica**
- **PF**: nome completo, celular, CPF (validado com `isValidCPF`), email, data nascimento, como nos conheceu, endereço (CEP + ViaCEP auto-preenche), número, complemento, observações (alergias/referências)
- **PJ**: nome contato, telefone, CNPJ, razão social, email, como nos conheceu, endereço, observações
- Se houver documentos vinculados: depois de validar dados pessoais, mostra cada documento inline (reaproveita `FillDocumentDialog`/`PreencherDocumento` lógica) — cliente preenche e assina
- Submit → chama edge function → tela de sucesso

### 4. Indicação na lista de clientes
- `ClientCard` e tabela de `/clientes`: badge pequena **"Cadastro via link"** quando `registration_source = 'self_link'`

## Validações (cliente + servidor)
- Nome ≥ 2 chars
- Celular: 10-11 dígitos
- CPF: algoritmo completo (`isValidCPF`)
- CNPJ: 14 dígitos
- Email: regex padrão
- CEP: 8 dígitos + ViaCEP
- UF: 2 chars, válida
- Duplicidade: telefone, CPF, CNPJ — bloqueio com mensagem clara

## Arquivos a criar/editar

**Criar:**
- `supabase/migrations/*_client_registration_links.sql`
- `supabase/functions/submit-client-registration/index.ts`
- `src/components/clients/GenerateRegistrationLinkDialog.tsx`
- `src/components/clients/NewClientModeDialog.tsx` (seletor inicial)
- `src/pages/CadastroCliente.tsx` (página pública)
- `src/hooks/useClientRegistrationLinks.ts`

**Editar:**
- `src/pages/Clientes.tsx` — botão "Novo Cliente" abre seletor
- `src/components/clients/ClientCard.tsx` — badge "Cadastro via link"
- `src/App.tsx` — adicionar rota pública `/cadastro-cliente/:token`
- `src/integrations/supabase/types.ts` — auto-regenerado após migração

## Fora do escopo (esta entrega)
- Assinatura Gov.br nova: reaproveita 100% o fluxo existente em documentos preenchidos (já gera PDF, já permite envio posterior)
- Link por cliente único (decisão: link é reutilizável conforme pedido — "o link pode ser o mesmo, o que muda é profissional e documentos"). Cada geração cria um link novo configurável.
