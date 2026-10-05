# Resumo de consulta com IA na ficha do cliente

## O que o profissional vai ver
- Uma nova aba **"Consultas"** no perfil do cliente, ao lado de Documentos e Fotos.
- O botão **"Nova consulta"** abre um painel lateral com:
  1. Um campo livre para escrever as observações, do jeito que vier. Opcionalmente, dá para ligar a consulta a um agendamento do cliente.
  2. O botão **"Gerar resumo"**. O texto aparece aos poucos, organizado em seções.
  3. O resumo fica **editável** para revisão. O profissional pode ajustar, gerar de novo ou descartar.
  4. O botão **"Salvar na ficha"** guarda o resumo revisado junto com as observações originais.
- A lista de consultas salvas mostra data, profissional e um trecho do resumo. Ao tocar, abre a consulta completa, com as opções de editar ou excluir.
- O atalho **"Registrar consulta"** também aparece nos detalhes do agendamento, já ligado àquele agendamento.

## Formato do resumo
Seções fixas, em português e sem inventar informação:
- **Queixa / motivo do atendimento**
- **Procedimentos realizados**
- **Observações e achados**
- **Orientações ao cliente**
- **Próximos passos / retorno**
- **Pontos de atenção** (alergias, contraindicações mencionadas)

Quando um ponto não estiver nas observações, a seção aparece como "Não informado". A linguagem segue a área do negócio, como barbearia, odontologia ou estética.

## Privacidade e permissões
- Segue as mesmas regras de privacidade das outras fichas: o profissional vê as próprias consultas, e o administrador vê todas, conforme a configuração de privacidade (privado, compartilhado ou geral).
- O texto é enviado para a IA só quando a pessoa toca em "Gerar resumo". Nada é gerado sem esse toque, e nada fica salvo sem a revisão.
- Cada criação, edição e exclusão fica registrada na auditoria.

## Custos e limites
- Cada resumo gerado usa créditos de IA do seu espaço no Lovable. Se os créditos acabarem, aparece uma mensagem clara e as observações digitadas continuam salvas no rascunho.
- Se a IA estiver ocupada, aparece o aviso "tente novamente em instantes", sem perder o que foi digitado.

## Detalhes técnicos
- **Banco (migração):** nova tabela `client_consultation_notes` com `client_id`, `appointment_id` (opcional), `raw_notes`, `summary`, `account_owner_id`, `owner_professional_id`, `visibility`, `created_by`, datas. Inclui as permissões de acesso para usuários logados e para o servidor, proteção por linha, regras iguais às de `client_documents` (`can_access_client_record` / `can_see_record`), gatilho de `updated_at`, gatilho de auditoria e atualização em tempo real.
- **Chave de IA:** criar `LOVABLE_API_KEY` e guardá-la como segredo das funções do servidor no Supabase do projeto.
- **Função do servidor `summarize-consultation`:** valida o usuário logado e o acesso ao cliente; chama a AI Gateway em `/v1/responses` com `openai/gpt-6-astra`, com resposta em streaming, raciocínio `low` e `store: false`; envia instruções com as seções fixas e a área do negócio; repassa os erros 402, 403 e 429 com mensagens claras, sem tentar de novo automaticamente.
- **App:** `ClientConsultationsTab.tsx`, `ConsultationSummarySheet.tsx` e o hook `useConsultationNotes.ts`; rascunho local enquanto a pessoa digita; atalho em `AppointmentDetailDialog.tsx`; mensagens passam por `humanizeError`.
- **Testes:** teste de proteção para a função de leitura do streaming e para o envio só ao tocar no botão; uma chamada real à função para conferir a resposta antes de considerar pronto.
