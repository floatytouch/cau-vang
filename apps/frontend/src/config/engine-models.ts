/** Default model ids offered in the picker for known engines. */
export const ENGINE_MODEL_CATALOG: Readonly<Record<string, readonly string[]>> = {
  mock: ['mock-model'],
  'mock-harness': ['mock-harness-model'],
  claude: ['claude-sonnet-4-5', 'claude-opus-4-5'],
  cursor: ['composer-2.5'],
  lumo: ['lumo-lite'],
};

export function modelsForEngine(engineId: string): readonly string[] {
  return ENGINE_MODEL_CATALOG[engineId] ?? ['default'];
}

export function defaultModelForEngine(engineId: string): string {
  const models = modelsForEngine(engineId);
  const first = models[0];
  if (!first) {
    throw new Error(`No default model configured for engine ${engineId}`);
  }
  return first;
}
