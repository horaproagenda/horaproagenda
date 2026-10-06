# Corrigir a mensagem falsa de erro em "Kit agendado"

## Causa encontrada
O kit é agendado. A mensagem é de sucesso, mas o texto sai trocado.

1. Quando o kit é salvo, o app manda o aviso "Kit agendado: 3 atendimento(s) criados."
2. Todo aviso passa por um tradutor, que troca termos técnicos por frases simples. Ele corta o texto nos dois-pontos e analisa só a parte depois deles: "3 atendimento(s) criados."
3. Para o tradutor, um texto é português quando tem acento (ç, ã, é...) ou palavras como "não", "cliente" ou "horário". Essa frase não tem nenhum dos dois, então ele a trata como erro técnico. No lugar dela, põe a frase padrão: "Não foi possível concluir esta ação agora...".
4. O problema não é só do kit. Pode aparecer em qualquer aviso com dois-pontos e um final curto sem acento, por exemplo "Kit atualizado: 2 atendimento(s) reagendados."

## Correções
1. **Avisos de sucesso não passam mais pelo tradutor de erros.** Mensagens de "deu certo" aparecem exatamente como foram escritas.
2. **O tradutor só troca o texto quando ele tem marcas técnicas de verdade** (códigos, termos de banco de dados, inglês de sistema). A falta de acento deixa de ser motivo para trocar.
3. **Um teste de proteção** confirma que "Kit agendado: 3 atendimento(s) criados." e "Kit atualizado: 2 atendimento(s) reagendados." aparecem iguais. Ele também confirma que erros técnicos de verdade continuam sendo traduzidos.

## Detalhes técnicos
- `src/lib/toast.ts`: `toast.success` (e o caminho base) passa a chamar `stripTechnicalNoise` em vez de `humanizeToastMessage`. `error`/`warning` continuam humanizados.
- `src/lib/humanError.ts` (`humanizeToastMessage`): trocar a condição `looksTechnical(rest) || !/[acentos]/.test(rest)` por apenas `looksTechnical(rest)`.
- Novo teste em `src/__tests__/regression/toast-success-not-humanized.test.ts`.
- Rodar `tsgo` e `bunx vitest run`.
