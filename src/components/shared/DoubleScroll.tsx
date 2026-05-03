import {
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

/**
 * Wrapper que adiciona uma barra de rolagem horizontal SECUNDÁRIA
 * acima do conteúdo, espelhada com a barra inferior.
 *
 * Útil em tabelas largas onde o usuário não quer descer até o final
 * para encontrar a barra de rolagem.
 */
export function DoubleScroll({ children }: PropsWithChildren) {
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [innerWidth, setInnerWidth] = useState(0);
  const syncing = useRef<'top' | 'bottom' | null>(null);

  // Atualiza a largura da barra superior conforme o conteúdo
  useEffect(() => {
    if (!innerRef.current) return;
    const el = innerRef.current;
    const update = () => setInnerWidth(el.scrollWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Sincroniza scroll entre as duas barras
  const onScroll = (source: 'top' | 'bottom') => () => {
    if (syncing.current && syncing.current !== source) return;
    syncing.current = source;
    if (source === 'top' && bottomRef.current && topRef.current) {
      bottomRef.current.scrollLeft = topRef.current.scrollLeft;
    } else if (source === 'bottom' && bottomRef.current && topRef.current) {
      topRef.current.scrollLeft = bottomRef.current.scrollLeft;
    }
    requestAnimationFrame(() => {
      syncing.current = null;
    });
  };

  return (
    <div className="relative">
      {/* Barra de rolagem superior (espelha a inferior) */}
      <div
        ref={topRef}
        onScroll={onScroll('top')}
        className="overflow-x-auto overflow-y-hidden h-3 mb-1"
        aria-hidden="true"
      >
        <div style={{ width: innerWidth, height: 1 }} />
      </div>

      {/* Conteúdo real com scroll inferior */}
      <div
        ref={bottomRef}
        onScroll={onScroll('bottom')}
        className="overflow-x-auto"
      >
        <div ref={innerRef} className="inline-block min-w-full align-top">
          {children}
        </div>
      </div>
    </div>
  );
}
