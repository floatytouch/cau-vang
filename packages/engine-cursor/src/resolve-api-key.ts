/**
 * Cursor credential precedence: non-empty explicit option, then CURSOR_API_KEY.
 * Undefined means omit apiKey on Agent.create so @cursor/sdk uses the stored
 * login from Cursor.auth.login().
 */
export function resolveCursorApiKey(explicit?: string): string | undefined {
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
