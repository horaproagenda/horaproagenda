import { useEffect } from 'react';

const getScrollableParent = (start: EventTarget | null, deltaY: number, deltaX: number) => {
  let element = start instanceof Element ? start : null;

  while (element && element !== document.body) {
    const style = window.getComputedStyle(element);
    const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY)
      && element.scrollHeight > element.clientHeight + 1;
    const canScrollX = /(auto|scroll|overlay)/.test(style.overflowX)
      && element.scrollWidth > element.clientWidth + 1;

    const hasVerticalRoom = deltaY > 0
      ? element.scrollTop < element.scrollHeight - element.clientHeight - 1
      : element.scrollTop > 1;
    const hasHorizontalRoom = deltaX > 0
      ? element.scrollLeft < element.scrollWidth - element.clientWidth - 1
      : element.scrollLeft > 1;

    if ((deltaY && canScrollY && hasVerticalRoom) || (deltaX && canScrollX && hasHorizontalRoom)) {
      return element;
    }

    element = element.parentElement;
  }

  return document.scrollingElement as HTMLElement | null;
};

export function useWheelScrollFix() {
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.defaultPrevented) return;

      const scroller = getScrollableParent(event.target, event.deltaY, event.deltaX);
      if (!scroller) return;

      const beforeTop = scroller.scrollTop;
      const beforeLeft = scroller.scrollLeft;
      scroller.scrollTop += event.deltaY;
      scroller.scrollLeft += event.deltaX;

      if (scroller.scrollTop !== beforeTop || scroller.scrollLeft !== beforeLeft) {
        event.preventDefault();
      }
    };

    window.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    return () => window.removeEventListener('wheel', handleWheel, { capture: true });
  }, []);
}