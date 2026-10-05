import { HEALTH_PATH, type HealthResponse } from '@noot/shared';

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(HEALTH_PATH, { signal });
  if (!response.ok) {
    throw new Error(`GET ${HEALTH_PATH} failed with HTTP ${response.status}`);
  }
  return (await response.json()) as HealthResponse;
}
