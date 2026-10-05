import type { ReactElement } from 'react';
import { THEME_PREFERENCES, type ThemePreference } from '../theme/theme.js';
import { useTheme } from '../theme/ThemeProvider.js';

export function ThemeToggle(): ReactElement {
  const { preference, setPreference } = useTheme();
  return (
    <label className="noot-status">
      Theme{' '}
      <select
        className="noot-select"
        aria-label="Color theme"
        value={preference}
        onChange={(event) => setPreference(event.target.value as ThemePreference)}
      >
        {THEME_PREFERENCES.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </label>
  );
}
