/**
 * Factory-only credential handling: a non-empty apiKey option is passed through;
 * undefined means omit apiKey on Agent.create so @cursor/sdk uses stored login
 * (Cursor.auth.login()). Env vars are never read here -- Nest ConfigService (or
 * another host) resolves CURSOR_API_KEY and passes it as config.apiKey.
 */
export function resolveCursorApiKey(explicit?: string): string | undefined {
  if (explicit === undefined) {
    return undefined;
  }
  if (explicit.length === 0) {
    throw new Error('Cursor API key was explicitly set to an empty string');
  }
  return explicit;
}
