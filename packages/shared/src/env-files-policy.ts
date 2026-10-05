export const NODE_ENV_DEVELOPMENT = 'development';
export const NODE_ENV_PRODUCTION = 'production';
export const NODE_ENV_STAGING = 'staging';

/** yarn start sets NODE_ENV=production; Vite production/staging modes are also non-development, so .env is opt-in. */
export function shouldLoadEnvFiles(environmentName: string | undefined): boolean {
  if (environmentName === undefined) {
    return false;
  }
  return environmentName.trim().toLowerCase() === NODE_ENV_DEVELOPMENT;
}
