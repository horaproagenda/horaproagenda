import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Sistema de "retomar posição" em listagens grandes.
 *
 * Regras (revisado):
 *  - Só começa a salvar posição após o usuário permanecer > MIN_DWELL_MS na
 *    tela E ter rolado (ou interagido) de forma significativa.
 *  - O banner "Retomar" só aparece em uma **nova visita** à tela — quando o
 *    estado salvo foi gravado em uma visita anterior (visitId diferente).
 *    Não aparece durante a própria sessão em que a posição foi capturada.
 *  - O banner NÃO aparece na primeira visita da aba.
 *  - Ao clicar em Retomar, restaura scroll + página + busca quando possíveis.
 */

export interface ListPositionState {
  scrollY?: number;
  page?: number;
  search?: string;
  lastItemId?: string;
  lastItemLabel?: string;
  letter?: string;
  /** Identificador da visita que gravou este estado. */
  visitId?: string;
  savedAt: number;
}

const STORAGE_PREFIX = 'list-position:';
const MAX_AGE_MS = 1000 * 60 * 60 * 8; // 8h
const MIN_DWELL_MS = 20_000; // 20s antes de começar a salvar
const MIN_SCROLL_PX = 200; // rolagem mínima considerada significativa

// visitId único por montagem — quando o usuário sai e volta, um novo é gerado.
const genVisitId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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

function writeState(key: string, state: Partial<ListPositionState>, visitId: string) {
  try {
    const current = readState(key) ?? { savedAt: Date.now() };
    const merged: ListPositionState = {
      ...current,
      ...state,
      visitId,
      savedAt: Date.now(),
    };
    sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(merged));
  } catch {
    // ignore
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
  key: string;
  enabled?: boolean;
  /** Callback opcional para restaurar página/busca quando retomar. */
  onRestore?: (state: ListPositionState) => void;
}

export function useListPosition({ key, enabled = true, onRestore }: UseListPositionOptions) {
  const [savedState, setSavedState] = useState<ListPositionState | null>(null);
  const visitIdRef = useRef<string>(genVisitId());
  const mountedAtRef = useRef<number>(Date.now());
  const readyToSaveRef = useRef(false);

  // Lê estado salvo na montagem — só mostra se for de uma visita ANTERIOR.
  useEffect(() => {
    if (!enabled) return;
    const state = readState(key);
    const currentVisit = visitIdRef.current;
    const hasMeaningfulState =
      state && (state.scrollY || state.page || state.search || state.lastItemId || state.letter);
    if (hasMeaningfulState && state.visitId && state.visitId !== currentVisit) {
      setSavedState(state);
    }
  }, [key, enabled]);

  // Libera o salvamento após MIN_DWELL_MS
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => {
      readyToSaveRef.current = true;
    }, MIN_DWELL_MS);
    return () => clearTimeout(t);
  }, [key, enabled]);

  // Captura scroll com debounce; só grava se dwell mínimo + scroll relevante.
  useEffect(() => {
    if (!enabled) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (!readyToSaveRef.current) {
          ticking = false;
          return;
        }
        const main = document.querySelector('main');
        const y = main?.scrollTop ?? window.scrollY;
        if (y >= MIN_SCROLL_PX) {
          writeState(key, { scrollY: y }, visitIdRef.current);
        }
        ticking = false;
      });
    };
    const main = document.querySelector('main');
    const target: HTMLElement | Window = main ?? window;
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => target.removeEventListener('scroll', onScroll);
  }, [key, enabled]);

  const savePosition = useCallback(
    (partial: Partial<Omit<ListPositionState, 'savedAt' | 'visitId'>>) => {
      if (!enabled) return;
      // Metadados como página/busca podem gravar imediatamente (sem MIN_DWELL)
      // pois refletem uma intenção clara de contexto.
      writeState(key, partial, visitIdRef.current);
    },
    [key, enabled],
  );

  const dismiss = useCallback(() => {
    setSavedState(null);
    clearListPosition(key);
  }, [key]);

  const restore = useCallback(() => {
    if (!savedState) return;
    if (onRestore) {
      try {
        onRestore(savedState);
      } catch {
        // ignore
      }
    }
    if (savedState.scrollY) {
      const main = document.querySelector('main');
      const target = savedState.scrollY;
      // dá um tick para o listener re-renderizar antes de rolar
      requestAnimationFrame(() => {
        if (main) main.scrollTo({ top: target, behavior: 'smooth' });
        else window.scrollTo({ top: target, behavior: 'smooth' });
      });
    }
    setSavedState(null);
  }, [savedState, onRestore]);

  return { savedState, savePosition, restore, dismiss };
}
