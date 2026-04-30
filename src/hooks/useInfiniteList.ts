import { useEffect, useRef, useState, useMemo } from 'react';

const PAGE_SIZE = 24;

/**
 * Infinite scroll helper.
 * Returns a slice of `items` and a sentinel ref to attach to a div at the
 * bottom of the list. When the sentinel intersects the viewport, more items
 * are revealed.
 */
export function useInfiniteList<T>(items: T[], pageSize: number = PAGE_SIZE) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset visible count when source list changes (filters, search, etc.)
  useEffect(() => {
    setVisibleCount(pageSize);
  }, [items.length, pageSize]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    if (visibleCount >= items.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((c) => Math.min(c + pageSize, items.length));
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visibleCount, items.length, pageSize]);

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const hasMore = visibleCount < items.length;

  return { visibleItems, hasMore, sentinelRef, visibleCount, total: items.length };
}
