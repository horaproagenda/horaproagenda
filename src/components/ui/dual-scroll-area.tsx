import { useEffect, useRef, useState, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DualScrollAreaProps {
  children: ReactNode;
  className?: string;
  /** min width applied to inner content (e.g. "min-w-[950px]") */
  innerClassName?: string;
  /** height of the scroll viewport */
  maxHeight?: string;
}

/**
 * A scroll area that exposes BOTH a top and bottom horizontal scrollbar,
 * synchronized with the main scrollable content. Vertical scroll is native
 * on the bottom area.
 */
export function DualScrollArea({
  children,
  className,
  innerClassName,
  maxHeight = '450px',
}: DualScrollAreaProps) {
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);

  // Sync content width to top scrollbar spacer
  useEffect(() => {
    if (!contentRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContentWidth(entry.target.scrollWidth);
      }
    });
    observer.observe(contentRef.current);
    setContentWidth(contentRef.current.scrollWidth);
    return () => observer.disconnect();
  }, [children]);

  // Sync scroll between top and bottom
  const syncing = useRef(false);
  const onTopScroll = () => {
    if (syncing.current || !bottomRef.current || !topRef.current) return;
    syncing.current = true;
    bottomRef.current.scrollLeft = topRef.current.scrollLeft;
    requestAnimationFrame(() => { syncing.current = false; });
  };
  const onBottomScroll = () => {
    if (syncing.current || !bottomRef.current || !topRef.current) return;
    syncing.current = true;
    topRef.current.scrollLeft = bottomRef.current.scrollLeft;
    requestAnimationFrame(() => { syncing.current = false; });
  };

  return (
    <div className={cn('w-full', className)}>
      {/* Top horizontal scrollbar */}
      <div
        ref={topRef}
        onScroll={onTopScroll}
        className="overflow-x-auto overflow-y-hidden"
        style={{ height: 12 }}
      >
        <div style={{ width: contentWidth, height: 1 }} />
      </div>
      {/* Main scroll area */}
      <div
        ref={bottomRef}
        onScroll={onBottomScroll}
        className="overflow-auto"
        style={{ maxHeight }}
      >
        <div ref={contentRef} className={innerClassName}>
          {children}
        </div>
      </div>
    </div>
  );
}
