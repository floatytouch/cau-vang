export const HEALTH_PATH = '/health';

export const HEALTH_STATUS_OK = 'ok' as const;

export interface HealthResponse {
  status: typeof HEALTH_STATUS_OK;
  service: string;
  uptimeSeconds: number;
  timestamp: string;
}
