import { NOOT_BRAIN_TOOL_PREFIX } from './constants.js';

/** Maps the SDK-facing tool name back to the name the brain registered. */
export function brainToolName(sdkToolName: string): string {
  return sdkToolName.startsWith(NOOT_BRAIN_TOOL_PREFIX)
    ? sdkToolName.slice(NOOT_BRAIN_TOOL_PREFIX.length)
    : sdkToolName;
}
