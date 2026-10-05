import { DEFAULT_BACKEND_PORT } from '@noot/shared';

const MAX_TCP_PORT = 65535;

export function resolvePort(rawPort: string | undefined): number {
  if (rawPort === undefined || rawPort === '') return DEFAULT_BACKEND_PORT;
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > MAX_TCP_PORT) {
    throw new Error(`Invalid PORT "${rawPort}": expected an integer 1-${MAX_TCP_PORT}.`);
  }
  return port;
}
