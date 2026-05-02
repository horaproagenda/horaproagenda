import { useEffect, useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';

export interface AppearanceSettings {
  primaryColor: string; // HSL string like "333 71% 50%"
  darkMode: boolean;
  animations: boolean;
}

export const PRIMARY_COLOR_PALETTE: { name: string; hsl: string; hex: string }[] = [
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
  { name: 'Marrom',          hsl: '25 35% 45%',  hex: '#9A6B4D' },
  { name: 'Cinza Grafite',   hsl: '220 10% 35%', hex: '#4B5563' },
  { name: 'Preto Suave',     hsl: '240 6% 18%',  hex: '#2C2C30' },
];

const STORAGE_KEY = 'appearance-settings-v1';

const DEFAULT_SETTINGS: AppearanceSettings = {
  primaryColor: '333 71% 50%',
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

export function useAppearanceSettings() {
  const [settings, setSettings] = useLocalStorage<AppearanceSettings>(STORAGE_KEY, DEFAULT_SETTINGS);

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
  }, [setSettings]);

  return { settings, updateSettings };
}

// Apply persisted settings as early as possible (called from main.tsx)
export function bootstrapAppearance() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const settings: AppearanceSettings = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
    applyAppearance(settings);
  } catch {
    applyAppearance(DEFAULT_SETTINGS);
  }
}
