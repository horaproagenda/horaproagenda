# Corrigir os quatro testes de fumaça do GitHub Actions

## Objetivo
Atualizar as verificações que ainda estão com as comparações antigas e eliminar falsos negativos na esteira.

## Alterações
- Corrigir a grade de 45 minutos para validar horários realmente gerados.
- Comparar reagendamento por instante real, independentemente do formato textual do fuso.
- Testar ausência de preferência removendo temporariamente o registro e restaurando seu estado completo depois.
- Tornar o teste em tempo real robusto: validar login e inserção, iniciar o prazo após a conexão e ampliar a tolerância da infraestrutura.
- Evitar que a segunda execução dos testes no workflow repita toda a suíte apenas para contar testes ignorados.

## Validação
- Executar os quatro arquivos corrigidos sem credenciais locais para conferir descoberta e comportamento de proteção.
- Executar verificação de tipos e testes de regressão aplicáveis.
- Conferir o diagnóstico automático do aplicativo após as mudanças.

## Observação
A validação autenticada final continuará ocorrendo no GitHub Actions, onde estão as credenciais protegidas.
