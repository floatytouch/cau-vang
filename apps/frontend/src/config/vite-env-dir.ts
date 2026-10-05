export const VITE_MODE_PRODUCTION = 'production';
export const VITE_PRODUCTION_SKIP_ENV_SEGMENTS = [
  'apps',
  'frontend',
  '.vite-skip-env-files',
] as const;

export function resolveViteEnvDir(mode: string, repoRoot: string): string {
  if (mode === VITE_MODE_PRODUCTION) {
    return [repoRoot, ...VITE_PRODUCTION_SKIP_ENV_SEGMENTS].join('/');
  }
  return repoRoot;
}

export function resolveViteBackendUrl(
  processBackendUrl: string | undefined,
  fileBackendUrl: string | undefined,
  fallback: string,
): string {
  return processBackendUrl ?? fileBackendUrl ?? fallback;
}
