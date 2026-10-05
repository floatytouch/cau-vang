export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const THEME_STORAGE_KEY = 'noot-theme-preference';
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): 'light' | 'dark' {
  if (preference === 'system') {
    return systemDark ? 'dark' : 'light';
  }
  return preference;
}

export function readStoredThemePreference(storage: Pick<Storage, 'getItem'>): ThemePreference {
  const raw = storage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(raw) ? raw : DEFAULT_THEME_PREFERENCE;
}
