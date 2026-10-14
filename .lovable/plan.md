# Ficha de Aplicação / Procedimento

Uma nova aba **Fichas** no perfil do cliente, usada durante o atendimento para registrar avaliação, produtos aplicados, orientações e intercorrências, com histórico que não pode ser apagado depois de finalizado.

## O que a usuária verá

1. **Aba "Fichas" no perfil do cliente** — linha do tempo (data, procedimento, região, quantidade, profissional, status) e alternância para tabela comparativa, com busca e filtros (procedimento, profissional, status, período).
2. **Nova ficha** (painel lateral, 1 coluna no celular), em etapas:
   - Atendimento: data/hora, profissional, sala, procedimento (modelo), motivo; vínculo opcional com um agendamento do cliente.
   - Avaliação: queixa, objetivo, área, condições, alergias, medicamentos, procedimentos anteriores, observações.
   - Campos próprios do modelo do procedimento.
   - Itens aplicados (vários): produto do cadastro (preenche fabricante e unidade), lote, validade, região, lado (Direito/Esquerdo/Bilateral/Central/Não se aplica), quantidade numérica > 0, unidade, técnica, diluição, observações.
   - Orientações, data de retorno, intercorrências.
   - Anexos: fotos antes/durante/depois e documentos já existentes do cliente.
3. **Status**: Rascunho → Em atendimento → Aguardando assinatura → Finalizada (ou Cancelada). Finalizada fica somente leitura.
4. **Retificação**: em ficha finalizada, botão "Retificar" cria nova versão com motivo obrigatório, mantendo a original visível.
5. **Usar ficha anterior como referência**: cria rascunho copiando procedimento, região, técnica e observações; produto, lote, validade e quantidade ficam em branco para nova confirmação.
6. **Modelos por procedimento** (Configurações, só administrador): criar/editar campos (texto, texto longo, número, seleção, sim/não, data) com identificador fixo. Já vêm prontos: Preenchimento, Toxina botulínica, Bioestimulador, Skinbooster, Laser, Peeling, Microagulhamento, Personalizado.
7. **Imprimir/PDF** da ficha.

## Validação ao finalizar
Cliente, profissional, data, procedimento, ao menos um item com região, produto, quantidade > 0 e unidade; lote exigido quando o produto pede; campos obrigatórios do modelo.

## Permissões
- Administrador: tudo, inclusive modelos.
- Profissional: cria e finaliza fichas dos próprios atendimentos; vê as que tem acesso pelo cliente.
- Recepção: só visualiza dados administrativos (data, procedimento, profissional, status), sem dados técnicos.
- Toda criação, finalização, retificação e cancelamento entra no log de auditoria.

## Detalhes técnicos
- Tabelas (com GRANTs, RLS por `account_owner_id` + `has_role`/regras de profissional existentes, gatilho `updated_at`, auditoria):
  - `procedure_templates` (name, slug, fields jsonb `[{id,label,type,options,required}]`, version, is_active).
  - `application_records` (client_id, professional_id, procedure_template_id, template_snapshot jsonb, appointment_id, room_id, status, performed_at, reason, assessment jsonb, guidance, follow_up_date, incidents, based_on_id, amends_id, amendment_reason, completed_at).
  - `application_items` (application_id, product_id, product_name_snapshot, manufacturer_snapshot, lot_number, expiration_date, region, side, quantity numeric, unit, technique, dilution, notes).
  - `application_field_values` (application_id, field_id, value; único por par).
  - `application_attachments` (application_id, attachment_type, file_path ou document_id/photo_id).
- Gatilho bloqueia UPDATE/DELETE em fichas `completed` (só via RPC `amend_application_record`, que cria nova linha `amended`).
- RPC `complete_application_record` valida servidor-side as regras acima e devolve códigos traduzidos por `humanizeError`.
- Recepção lê por view `application_records_admin` sem colunas técnicas.
- Fotos reutilizam o bucket de fotos de tratamento existente.
- Testes: validação de finalização (quantidade ≤ 0, sem lote, obrigatório vazio), cópia de referência não copia lote/validade/quantidade, bloqueio de edição após finalizar.
