// Either variable makes the CLI bill an API credential instead of the Max plan OAuth login in ~/.claude.
const API_CREDENTIAL_ENV_VARS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'] as const;

export function oauthSubprocessEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const name of API_CREDENTIAL_ENV_VARS) {
    delete env[name];
  }
  return env;
}
