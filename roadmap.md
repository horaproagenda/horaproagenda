# Roadmap

## Backend como fonte oficial — revisão integral
- [ ] Auditar operações e regras instaladas de todos os módulos
- [ ] Consolidar vendas, recebimentos, caixa e comissões em operações oficiais
- [ ] Consolidar agenda, pacotes e recursos preservando datas manuais
- [ ] Conferir produtos, documentos e fichas com autoridade e histórico protegidos
- [ ] Conferir cadastros, configurações, usuários, assinaturas e integrações
- [ ] Fechar escritas que contornam regras e conferir isolamento/grants/RLS
- [ ] Alinhar telas, cache, PWA e sincronização às respostas do servidor
- [ ] Validar regressões e fluxos autenticados com dados isolados — acesso autenticado de teste indisponível no Supabase externo

- [x] Centralizar o ciclo de uso e proteger datas, versões e baixa única no banco
- [x] Sincronizar Produtos, histórico, previsões e correções auditadas
- [x] Auditar e reconciliar 19 ciclos antigos comprovados sem baixar estoque
- [x] Executar 91 testes unitários de produtos, conferir build e bloqueio anônimo
- [ ] Validar finalização/correção e sincronização pelas telas autenticadas — Supabase externo sem sessão ou conta de teste disponível
- [ ] Reconciliar dois usos sem quantidade e uma compra com término anterior ao início — depende das informações corretas do responsável

- [x] Auditar permissões e isolamento do financeiro próprio versus caixa da clínica
- [x] Corrigir CRUD financeiro próprio e abertura/fechamento do caixa da clínica
- [x] Corrigir criação privada de produtos por qualquer profissional
- [x] Corrigir privacidade de lembretes pessoais
- [x] Corrigir criação de documentos próprios e leitura dos documentos da clínica autorizados
- [x] Adicionar testes de regressão para permissões ligadas e desligadas
- [x] Validar banco, testes, typecheck, build e fluxos autenticados possíveis
- [x] Validar confirmação de e-mail e conclusão idempotente do cadastro
- [x] Corrigir falsos negativos nos testes autenticados do GitHub Actions
- [x] Unificação 1: regras únicas de cadastro de clientes (tela, link público, importações, servidor)
- [x] Unificação 2: estoque alterado por um único caminho atômico (venda, consumo, devolução)
- [x] Unificação 3: venda do Caixa 100% no banco (tudo ou nada)
- [x] Unificação 4: tipo do documento (anamnese/contrato/termo) igual no app e no link público
