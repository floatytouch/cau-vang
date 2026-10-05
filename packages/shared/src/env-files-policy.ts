export const NODE_ENV_DEVELOPMENT = 'development';
export const NODE_ENV_PRODUCTION = 'production';
export const NODE_ENV_STAGING = 'staging';

/** yarn start and Vite production/staging leave this unset or non-development, so .env must be opt-in. */
export function shouldLoadEnvFiles(environmentName: string | undefined): boolean {
  if (environmentName === undefined) {
    return false;
  }
  return environmentName.trim().toLowerCase() === NODE_ENV_DEVELOPMENT;
}
