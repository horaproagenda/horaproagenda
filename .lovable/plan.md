# Corrigir definitivamente o código de confirmação do cadastro

## Diagnóstico confirmado

- O envio mais recente criou no banco um código de cadastro normalizado, com seis dígitos, validade de dez minutos e zero tentativas.
- Esse código expirou sem ser marcado como usado e sem registrar sequer uma tentativa inválida. Portanto, nessa ocorrência, a confirmação não alcançou a operação do servidor que compara o código; não foi uma diferença entre o código recebido e o armazenado.
- Não há logs recentes recuperáveis das três funções envolvidas, então hoje o fluxo não informa em qual passagem parou.
- O cadastro e a recuperação de senha usam implementações diferentes para validar o mesmo tipo de código. O cadastro pula a função central de validação e repete a lógica dentro da criação da conta.
- Os testes atuais apenas repetem a normalização em código de teste; eles não comprovam que um código realmente emitido é aceito pelo cadastro.

## Correção

1. **Unificar a confirmação do código**
   - Criar uma única rotina de validação para cadastro e recuperação de senha.
   - Normalizar e-mail e código somente nessa rotina compartilhada.
   - Aceitar qualquer código correto ainda válido quando mensagens chegarem fora de ordem, sem comparar apenas com o envio mais recente.
   - Aplicar em um único lugar expiração, limite de tentativas, bloqueio e mensagens de erro.

2. **Trocar o código por uma autorização curta de cadastro**
   - Ao validar os seis dígitos, emitir uma autorização temporária, aleatória e vinculada ao e-mail e ao tipo `signup`.
   - Guardar somente a versão protegida dessa autorização no banco.
   - A criação da conta exigirá essa autorização, não repetirá a comparação do código e permitirá nova tentativa se uma etapa posterior falhar.
   - Consumir a autorização somente após a conta, perfil, papel de administrador e dados iniciais obrigatórios serem concluídos.

3. **Eliminar corridas e cliques duplicados**
   - Tornar atômicas a contagem de tentativas, a confirmação e o consumo da autorização.
   - Impedir dois envios simultâneos no intervalo de reenvio.
   - Bloquear submissão duplicada no navegador enquanto a confirmação estiver em andamento.
   - Tornar a conclusão idempotente: repetir a mesma solicitação deve concluir ou recuperar o cadastro já iniciado, sem transformar sucesso parcial em “código inválido”.

4. **Corrigir o fluxo visível de cadastro**
   - Separar na tela “validando código” de “criando conta”, preservando os dados preenchidos durante falhas temporárias.
   - Usar a validade informada pelo servidor, evitando divergência entre o relógio da tela e o banco.
   - Mostrar mensagens específicas e humanizadas para: código incorreto, expirado, limite de tentativas, autorização expirada, e-mail já cadastrado e falha temporária.
   - Oferecer reenvio imediatamente quando o código realmente expirar, sem manter bloqueios antigos no navegador.

5. **Adicionar rastreabilidade segura**
   - Registrar cada etapa com um identificador da tentativa: envio aceito, e-mail encaminhado, código validado, autorização emitida, conta criada e cadastro concluído.
   - Não registrar código, senha, autorização ou dados pessoais nos logs.
   - Incluir um código interno de correlação nas respostas para localizar falhas futuras sem expor detalhes técnicos ao usuário.

6. **Testar o cadastro completo**
   - Testes automatizados da rotina real para código digitado e colado, e-mail com maiúsculas/espaços, código antigo ainda válido, código expirado, cinco erros, reenvio concorrente e duplo clique.
   - Testes de recuperação após falha entre validação, criação da conta, perfil e permissões.
   - Teste integrado das funções: enviar → validar → criar conta → entrar.
   - Teste no navegador em celular e computador, incluindo reenvio e entrada com a conta recém-criada.
   - Adicionar o fluxo às proteções obrigatórias de publicação e executar a verificação completa antes de concluir.

## Detalhes técnicos

- Atualizar `send-verification-code`, `verify-code` e `complete-signup` para usarem um módulo compartilhado de normalização, respostas e regras.
- Adicionar ao banco a autorização temporária protegida e uma função transacional para validar/tentar/confirmar códigos sem condições de corrida, com acesso apenas pelas funções do servidor.
- Atualizar `Auth.tsx` e `AuthContext.tsx` para o fluxo em duas fases: confirmar código e depois concluir cadastro com a autorização curta.
- Não alterar os fluxos de cobrança, agenda ou permissões além do necessário para garantir que o primeiro administrador seja criado corretamente.
