export interface FrontendConfig {
  /** Socket.IO endpoint; empty string means same origin (Vite proxy). */
  wsUrl: string;
  /** Shared funnel token; omitted from the handshake when unset (backend running mocks). */
  wsToken: string | undefined;
}

export interface FrontendEnv {
  readonly VITE_WS_URL?: string;
  readonly VITE_NOOT_WS_TOKEN?: string;
}

/** Sole place that reads Vite env for the UI; feature code takes FrontendConfig. */
export function loadFrontendConfig(env: FrontendEnv = import.meta.env): FrontendConfig {
  return {
    wsUrl: trimmedOrUndefined(env.VITE_WS_URL) ?? '',
    wsToken: trimmedOrUndefined(env.VITE_NOOT_WS_TOKEN),
  };
}

function trimmedOrUndefined(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}
