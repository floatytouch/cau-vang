import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LUMO_BASE_URL,
  LumoCredentialsError,
  resolveLumoClientConfig,
} from './lumo-config.js';

describe('resolveLumoClientConfig', () => {
  it('accepts explicit apiKey and baseUrl from factory options', () => {
    expect(resolveLumoClientConfig({ apiKey: 'k', baseUrl: 'http://proxy/v1/' })).toEqual({
      apiKey: 'k',
      baseUrl: 'http://proxy/v1',
    });
  });

  it('defaults baseUrl when omitted', () => {
    expect(resolveLumoClientConfig({ apiKey: 'k' }).baseUrl).toBe(DEFAULT_LUMO_BASE_URL);
  });

  it('fails closed when apiKey is missing or blank', () => {
    expect(() => resolveLumoClientConfig({})).toThrow(LumoCredentialsError);
    expect(() => resolveLumoClientConfig({ apiKey: '  ' })).toThrow(/apiKey is required/);
  });
});
