import { buildWsAuth } from '@noot/shared';

/** Vite-exposed shared token for BrainCore WS connects (same secret as NOOT_WS_TOKEN). */
export function readFrontendWsToken(
  env: Pick<ImportMetaEnv, 'VITE_NOOT_WS_TOKEN'> = import.meta.env,
): string | undefined {
  const raw = env.VITE_NOOT_WS_TOKEN;
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Socket.IO client `auth` option; omit when the backend runs mocks without a token. */
export function frontendWsAuth(
  env: Pick<ImportMetaEnv, 'VITE_NOOT_WS_TOKEN'> = import.meta.env,
): ReturnType<typeof buildWsAuth> | undefined {
  const token = readFrontendWsToken(env);
  return token === undefined ? undefined : buildWsAuth(token);
}
