import { MOCK_ENGINE_ID, MOCK_HARNESS_ENGINE_ID, OFFLINE_RULES_ENGINE_ID } from '@noot/shared';

export const CLAUDE_ENGINE_ID = 'claude';
export const CURSOR_ENGINE_ID = 'cursor';
export const LUMO_ENGINE_ID = 'lumo';
export const FALLBACK_MODEL_ID = 'default';

/** Default model ids offered in the picker for known engines. */
export const ENGINE_MODEL_CATALOG: Readonly<Record<string, readonly string[]>> = {
  [MOCK_ENGINE_ID]: ['mock-model'],
  [MOCK_HARNESS_ENGINE_ID]: ['mock-harness-model'],
  [OFFLINE_RULES_ENGINE_ID]: ['rules'],
  [CLAUDE_ENGINE_ID]: ['claude-sonnet-4-5', 'claude-opus-4-5'],
  [CURSOR_ENGINE_ID]: ['composer-2.5'],
  [LUMO_ENGINE_ID]: ['lumo-lite'],
};

export function modelsForEngine(engineId: string): readonly string[] {
  return ENGINE_MODEL_CATALOG[engineId] ?? [FALLBACK_MODEL_ID];
}

export function defaultModelForEngine(engineId: string): string {
  const models = modelsForEngine(engineId);
  const first = models[0];
  if (!first) {
    throw new Error(`No default model configured for engine ${engineId}`);
  }
  return first;
}
