# Separação avulso/pacote — evidências

- Banco impede anexar atendimento avulso existente pela coluna direta ou pela etapa reversa; origem de novos registros é derivada do vínculo no servidor.
- Batch cria atendimento já com etapa exata, preservando os identificadores de procedimento. Autoheal/find não procuram candidatos por nome, cliente ou serviço.
- Ana Flávia: avaliação 19/08 às 18h permanece realizada e independente. Atendimento 17/08 às 18h permanece faltou e independente; histórico confirmou vínculo posterior criado em 14/10 01:55 UTC, antes da correção.
- Recebimento `2797b503-9aa2-43b4-aac9-00fe2035e2d4`: R$ 3.800, pago em 26/09, mesma forma, mesma venda; referência à avaliação removida, sem novo lançamento.
- Pacote Corpo inteiro: 15 etapas, 9 vinculadas, primeira em 02/09 às 18h. Etapas liberadas ficam pendentes, sem horários inventados. Número visual separado da identidade original impede reparos de trocarem procedimentos.
- Migrações compararam datas, horários, status e serviços de todos os atendimentos da cliente antes/depois e abortariam em divergência; recebimento comparado sem alteração de valor/data/forma/status/venda.
- 20 testes unitários passaram. Compilação automática OK. Nenhuma publicação ou movimentação de teste em dados reais.
- Fluxo autenticado, concorrência e readback pelas telas ainda dependem de ambiente isolado autorizado; não foram declarados validados. 294 avisos Supabase preexistentes permanecem, sem novos avisos nessas migrações.