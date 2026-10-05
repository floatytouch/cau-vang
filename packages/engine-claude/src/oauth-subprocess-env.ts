// Either variable makes the CLI bill an API credential instead of the Max plan OAuth login in ~/.claude.
const API_CREDENTIAL_ENV_VARS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'] as const;

export function oauthSubprocessEnv(
  parentEnv: NodeJS.ProcessEnv,
): Record<string, string | undefined> {
  if (parentEnv == null || typeof parentEnv !== 'object') {
    throw new Error(
      'oauthSubprocessEnv requires a parent environment object from the app config layer',
    );
  }
  const env: Record<string, string | undefined> = { ...parentEnv };
  for (const name of API_CREDENTIAL_ENV_VARS) {
    delete env[name];
  }
  return env;
}
