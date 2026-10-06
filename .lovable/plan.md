# Corrigir "Erro ao atualizar modelo" nos documentos

## Causa encontrada (conferida no banco)
Ao salvar um modelo, o sistema tenta anotar no histórico de auditoria que a privacidade ou o dono do modelo mudou. Essa anotação usa o tipo "visibility_change", mas o histórico só aceita os tipos INSERT, UPDATE e DELETE. A anotação é recusada, e por isso o salvamento inteiro falha com a mensagem "Algum dado informado não é permitido por uma regra do sistema".

Isso acontece sempre que a privacidade ou o dono mudam ao salvar. Isso inclui dois casos:
- o administrador troca a privacidade (Privado / Compartilhado / Estabelecimento);
- um profissional edita um modelo que ele não criou. Uma regra automática passa o modelo para o nome dele e o deixa privado.

O mesmo erro afeta Clientes, Serviços, Pacotes, Produtos e Documentos do cliente, porque todas essas telas usam a mesma anotação.

## Outros erros no fluxo
1. Ao salvar, um profissional "toma posse" de um modelo do estabelecimento ou de outra pessoa. A regra que define o dono roda também na edição, não só na criação.
2. A mensagem de erro de documentos vem de um aviso antigo e junta o texto "Erro ao atualizar modelo:" com a explicação traduzida. Corrigir para o padrão do app.

## Correções
1. Gravar a anotação de privacidade com o tipo "UPDATE" e a marca "visibility_change" dentro dos detalhes. Assim o histórico continua completo e o salvamento não falha mais em nenhuma das telas.
2. Na edição, manter o dono e a privacidade originais quando quem edita é profissional; a troca automática vale só ao criar o modelo.
3. Trocar o aviso antigo pelo aviso padrão do app nos modelos de documentos.
4. Teste de proteção: atualizar um modelo trocando a privacidade e confirmar que salva e registra a anotação.

## Detalhes técnicos
- `tg_audit_visibility_change`: `action = 'UPDATE'`, `new_data` com `event: 'visibility_change'`.
- `enforce_personal_product_document_owner`: em `TG_OP = 'UPDATE'`, preservar `OLD.owner_professional_id`/`OLD.visibility` para não privilegiados (afeta também `products`).
- `useDocumentTemplatesManagement.ts`: `toast` de `@/lib/toast`.
- Teste de fumaça em `tests/smoke` + teste de regressão do hook.
