/** BrainCore-owned stage labels emitted as `progress` events in the turn envelope. */
export const PROGRESS_STAGE = {
  STARTING: 'starting',
  RUNNING_TOOLS: 'running_tools',
  FINISHING: 'finishing',
} as const;

export type ProgressStage = (typeof PROGRESS_STAGE)[keyof typeof PROGRESS_STAGE];
