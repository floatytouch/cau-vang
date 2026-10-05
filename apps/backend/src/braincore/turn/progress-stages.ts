/** BrainCore-owned stage labels emitted as `progress` events in the turn envelope. */
export const PROGRESS_STAGE_STARTING = 'starting' as const;
export const PROGRESS_STAGE_RUNNING_TOOLS = 'running_tools' as const;
export const PROGRESS_STAGE_FINISHING = 'finishing' as const;

export type ProgressStage =
  | typeof PROGRESS_STAGE_STARTING
  | typeof PROGRESS_STAGE_RUNNING_TOOLS
  | typeof PROGRESS_STAGE_FINISHING;
