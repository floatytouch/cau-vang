import type { WorkMode } from './work-mode.js';

/**
 * Injected at the start of the engine-facing message when plan mode is on.
 * Kept out of stored history so the UI still shows what the user typed.
 */
export function planNoteFor(mode: WorkMode): string {
  if (mode !== 'plan') {
    return '';
  }
  return (
    '(PLAN MODE is on -- do NOT read this bracket aloud: for any TASK with real ' +
    'impact -- editing code, writing files, builds, installs, background jobs, ' +
    'sending mail, changing calendars -- do NOT act right away; RESEARCH first, ' +
    'state the plan briefly as a few main steps, and ASK if Thinh agrees. ' +
    'Read-only research tools work normally. Mutating tools stay LOCKED until ' +
    "Thinh approves with a short 'ok' / 'go ahead' / 'làm đi' (or the Approve " +
    'button); that unlock lasts for exactly one turn. Questions and chat need ' +
    'no plan.) '
  );
}
