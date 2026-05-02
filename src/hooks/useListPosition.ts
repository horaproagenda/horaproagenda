import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Sistema de "retomar posição" em listagens grandes.
 * Salva em sessionStorage: scrollY, página, busca, último item visualizado.
 * Mostra um banner discreto ao voltar à tela permitindo retomar onde parou.
 */

export interface ListPositionState {
  scrollY?: number;
  page?: number;
  search?: string;
  lastItemId?: string;
  lastItemLabel?: string;
  /** Letra/seção atual da lista (ex: 'M' em clientes A-Z). */
  letter?: string;
  savedAt: number;
}

const STORAGE_PREFIX = 'list-position:';
const MAX_AGE_MS = 1000 * 60 * 60 * 8; // 8h dentro da mesma sessão

function readState(key: string): ListPositionState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ListPositionState;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      sessionStorage.removeItem(STORAGE_PREFIX + key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeState(key: string, state: Partial<ListPositionState>) {
  try {
    const current = readState(key) ?? { savedAt: Date.now() };
    const merged: ListPositionState = { ...current, ...state, savedAt: Date.now() };
    sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(merged));
  } catch {
    // ignore quota / privacy errors
  }
}

export function clearListPosition(key: string) {
  try {
    sessionStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    // ignore
  }
}

interface UseListPositionOptions {
  /** Identificador único da listagem (ex: 'clientes', 'produtos'). */
  key: string;
  /** Habilitar a captura/restauração. Default true. */
  enabled?: boolean;
}

export function useListPosition({ key, enabled = true }: UseListPositionOptions) {
  const [savedState, setSavedState] = useState<ListPositionState | null>(null);
  const dismissedRef = useRef(false);

  // Lê o estado salvo na montagem
  useEffect(() => {
    if (!enabled) return;
    const state = readState(key);
    if (state && (state.scrollY || state.page || state.search || state.lastItemId || state.letter)) {
      setSavedState(state);
    }
  }, [key, enabled]);

  // Captura scroll automaticamente
  useEffect(() => {
    if (!enabled) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const main = document.querySelector('main');
        const y = main?.scrollTop ?? window.scrollY;
        if (y > 50) writeState(key, { scrollY: y });
        ticking = false;
      });
    };
    const main = document.querySelector('main');
    const target: HTMLElement | Window = main ?? window;
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => target.removeEventListener('scroll', onScroll);
  }, [key, enabled]);

  const savePosition = useCallback(
    (partial: Partial<Omit<ListPositionState, 'savedAt'>>) => {
      if (!enabled) return;
      writeState(key, partial);
    },
    [key, enabled],
  );

  const dismiss = useCallback(() => {
    dismissedRef.current = true;
    setSavedState(null);
    clearListPosition(key);
  }, [key]);

  const restore = useCallback(() => {
    if (!savedState) return;
    if (savedState.scrollY) {
      const main = document.querySelector('main');
      requestAnimationFrame(() => {
        if (main) main.scrollTo({ top: savedState.scrollY!, behavior: 'smooth' });
        else window.scrollTo({ top: savedState.scrollY!, behavior: 'smooth' });
      });
    }
    setSavedState(null);
  }, [savedState]);

  return { savedState, savePosition, restore, dismiss };
}
