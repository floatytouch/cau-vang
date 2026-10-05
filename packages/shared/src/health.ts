export const HEALTH_PATH = '/health';

export interface HealthResponse {
  status: 'ok';
  service: string;
  uptimeSeconds: number;
  timestamp: string;
}
