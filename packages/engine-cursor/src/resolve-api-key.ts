/**
 * Cursor credential precedence for explicit adapter config: non-empty explicit
 * option, then CURSOR_API_KEY. When both are absent, omit apiKey on Agent.create
 * so @cursor/sdk can use stored login from Cursor.auth.login().
 */
export function resolveCursorApiKeyOptional(explicit?: string): string | undefined {
  if (explicit !== undefined) {
    if (explicit.length === 0) {
      throw new Error('Cursor API key was explicitly set to an empty string');
    }
    return explicit;
  }

  const fromEnv = process.env.CURSOR_API_KEY;
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv;
  }

  return undefined;
}

export function resolveCursorApiKey(explicit?: string): string {
  const resolved = resolveCursorApiKeyOptional(explicit);
  if (resolved !== undefined) {
    return resolved;
  }
  throw new Error(
    'Cursor API key missing: set CURSOR_API_KEY, pass apiKey to the adapter, or run Cursor SDK login',
  );
}
