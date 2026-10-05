import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  DEFAULT_THEME_PREFERENCE,
  readStoredThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from './theme.js';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: 'light' | 'dark';
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }): ReactElement {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    typeof localStorage === 'undefined'
      ? DEFAULT_THEME_PREFERENCE
      : readStoredThemePreference(localStorage),
  );
  const [systemDark, setSystemDark] = useState(() => readSystemDark());

  const onSystemSchemeChange = useEffectEvent((matches: boolean) => {
    setSystemDark(matches);
  });

  useEffect(() => {
    const media = getColorSchemeMedia();
    if (!media) {
      return;
    }
    const listener = (event: MediaQueryListEvent) => onSystemSchemeChange(event.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  const resolved = resolveTheme(preference, systemDark);

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  }, [preference, resolved]);

  return (
    <ThemeContext.Provider
      value={{
        preference,
        resolved,
        setPreference: setPreferenceState,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return value;
}

function getColorSchemeMedia(): MediaQueryList | undefined {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return undefined;
  }
  return window.matchMedia('(prefers-color-scheme: dark)');
}

function readSystemDark(): boolean {
  return getColorSchemeMedia()?.matches ?? false;
}
