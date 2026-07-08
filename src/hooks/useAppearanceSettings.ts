import { useEffect, useCallback, useRef } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface AppearanceSettings {
  primaryColor: string; // HSL string like "333 71% 50%"
  darkMode: boolean;
  animations: boolean;
}

export const PRIMARY_COLOR_PALETTE: { name: string; hsl: string; hex: string }[] = [
  { name: 'Marrom Neutro',   hsl: '25 35% 38%',  hex: '#7D573D' },
  { name: 'Marrom Claro',    hsl: '28 40% 55%',  hex: '#B08868' },
  { name: 'Café',            hsl: '20 25% 28%',  hex: '#594236' },
  { name: 'Areia',           hsl: '35 30% 60%',  hex: '#B8A079' },
  { name: 'Rosa Pink',       hsl: '333 71% 50%', hex: '#E0238A' },
  { name: 'Rosa Suave',      hsl: '350 60% 65%', hex: '#D88793' },
  { name: 'Coral',           hsl: '14 90% 60%',  hex: '#F26D3D' },
  { name: 'Vermelho',        hsl: '0 72% 51%',   hex: '#DC2626' },
  { name: 'Laranja',         hsl: '24 95% 53%',  hex: '#F97316' },
  { name: 'Âmbar',           hsl: '38 92% 50%',  hex: '#F59E0B' },
  { name: 'Dourado',         hsl: '45 80% 50%',  hex: '#E6B800' },
  { name: 'Verde Lima',      hsl: '84 70% 45%',  hex: '#84CC16' },
  { name: 'Verde',           hsl: '152 60% 40%', hex: '#16A34A' },
  { name: 'Esmeralda',       hsl: '160 70% 40%', hex: '#10B981' },
  { name: 'Teal',            hsl: '180 65% 40%', hex: '#14B8A6' },
  { name: 'Ciano',           hsl: '190 80% 45%', hex: '#06B6D4' },
  { name: 'Azul Céu',        hsl: '210 90% 55%', hex: '#3B82F6' },
  { name: 'Azul',            hsl: '220 80% 50%', hex: '#2563EB' },
  { name: 'Índigo',          hsl: '240 65% 55%', hex: '#6366F1' },
  { name: 'Violeta',         hsl: '262 80% 60%', hex: '#8B5CF6' },
  { name: 'Roxo',            hsl: '280 70% 55%', hex: '#A855F7' },
  { name: 'Magenta',         hsl: '310 75% 55%', hex: '#D946EF' },
  { name: 'Pink Vibrante',   hsl: '328 85% 60%', hex: '#EC4899' },
  { name: 'Cinza Grafite',   hsl: '220 10% 35%', hex: '#4B5563' },
  { name: 'Preto Suave',     hsl: '240 6% 18%',  hex: '#2C2C30' },
];

const STORAGE_KEY = 'appearance-settings-v1';

const DEFAULT_SETTINGS: AppearanceSettings = {
  primaryColor: '25 35% 38%',
  darkMode: false,
  animations: true,
};

function applyAppearance(settings: AppearanceSettings) {
  const root = document.documentElement;

  // Primary color
  root.style.setProperty('--primary', settings.primaryColor);
  root.style.setProperty('--ring', settings.primaryColor);
  root.style.setProperty('--sidebar-primary', settings.primaryColor);
  root.style.setProperty('--sidebar-ring', settings.primaryColor);

  // Dark mode
  if (settings.darkMode) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // Animations
  if (settings.animations) {
    root.classList.remove('no-animations');
  } else {
    root.classList.add('no-animations');
  }
}

function userStorageKey(userId?: string | null) {
  return userId ? `${STORAGE_KEY}::${userId}` : STORAGE_KEY;
}

export function useAppearanceSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useLocalStorage<AppearanceSettings>(
    userStorageKey(user?.id),
    DEFAULT_SETTINGS,
  );
  const hydratedForUser = useRef<string | null>(null);

  // Hydrate from DB on login (server is source of truth across devices)
  useEffect(() => {
    if (!user?.id) return;
    if (hydratedForUser.current === user.id) return;
    hydratedForUser.current = user.id;

    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from('professional_preferences')
          .select('primary_color, dark_mode, animations')
          .eq('user_id', user.id)
          .maybeSingle();
        if (error) return;
        if (!data) return;
        const patch: Partial<AppearanceSettings> = {};
        if (data.primary_color) patch.primaryColor = data.primary_color;
        if (typeof data.dark_mode === 'boolean') patch.darkMode = data.dark_mode;
        if (typeof data.animations === 'boolean') patch.animations = data.animations;
        if (Object.keys(patch).length > 0) {
          setSettings(prev => {
            const next = { ...prev, ...patch };
            applyAppearance(next);
            return next;
          });
        }
      } catch {
        /* ignore */
      }
    })();
  }, [user?.id, setSettings]);

  // Apply on mount and whenever settings change
  useEffect(() => {
    applyAppearance(settings);
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<AppearanceSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      applyAppearance(next);
      return next;
    });

    // Persist to DB so the choice follows the account across devices
    if (user?.id) {
      const dbPatch: Record<string, unknown> = { user_id: user.id };
      if (patch.primaryColor !== undefined) dbPatch.primary_color = patch.primaryColor;
      if (patch.darkMode !== undefined) dbPatch.dark_mode = patch.darkMode;
      if (patch.animations !== undefined) dbPatch.animations = patch.animations;
      if (Object.keys(dbPatch).length > 1) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('professional_preferences')
          .upsert(dbPatch, { onConflict: 'user_id' })
          .then(() => { /* fire-and-forget; local cache already updated */ });
      }
    }
  }, [setSettings, user?.id]);

  return { settings, updateSettings };
}

// Apply persisted settings as early as possible (called from main.tsx)
export function bootstrapAppearance() {
  try {
    // Try to find any user-scoped key first (last logged-in user in this browser)
    let raw: string | null = null;
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(`${STORAGE_KEY}::`)) {
        raw = window.localStorage.getItem(key);
        if (raw) break;
      }
    }
    if (!raw) raw = window.localStorage.getItem(STORAGE_KEY);
    const settings: AppearanceSettings = raw
      ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
      : DEFAULT_SETTINGS;
    applyAppearance(settings);
  } catch {
    applyAppearance(DEFAULT_SETTINGS);
  }
}
