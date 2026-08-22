import { useCallback, useRef, useState } from 'react';

/**
 * Guarda contra cliques duplos em ações assíncronas.
 *
 * Regressão histórica: botões de "Criar Despesa", "Confirmar Pagamento" e
 * "Criar Categoria" não desabilitavam durante o salvamento. Dois toques rápidos
 * (muito comum no celular) disparavam o handler duas vezes e criavam
 * lançamentos/parcelas/pagamentos duplicados no financeiro.
 *
 * `running` deve alimentar `disabled` do botão e o texto de carregamento.
 * O `ref` interno bloqueia a segunda chamada mesmo antes do React re-renderizar,
 * o que o `isPending` de mutations em laço (várias parcelas) não garante.
 */
export function useActionGuard() {
  const [running, setRunning] = useState(false);
  const lock = useRef(false);

  const run = useCallback(async (action: () => void | Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setRunning(true);
    try {
      await action();
    } finally {
      lock.current = false;
      setRunning(false);
    }
  }, []);

  return { running, run };
}
