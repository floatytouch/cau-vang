import type { NootEvent } from '@noot/shared';

import { choicesFromAskUserQuestionArgs } from './choices-from-tool.js';
import { ASK_USER_QUESTION_TOOL_NAME, UNKNOWN_TOOL_NAME } from './constants.js';
import type { EventSequence } from './event-sequence.js';
import { brainToolName } from './tool-names.js';

/** Remembers each call's brain-facing name so start/update/end events agree on it. */
export class ToolCallRegistry {
  private readonly namesByCallId = new Map<string, string>();

  constructor(private readonly sequence: EventSequence) {}

  start(
    callId: string | undefined,
    sdkName: string | undefined,
    args: unknown,
  ): {
    callId: string;
    events: NootEvent[];
  } {
    const id = callId ?? crypto.randomUUID();
    const name = brainToolName(sdkName ?? UNKNOWN_TOOL_NAME);
    this.namesByCallId.set(id, name);
    const events: NootEvent[] = [
      {
        ...this.sequence.meta(),
        type: 'tool_call',
        phase: 'start',
        status: 'running',
        callId: id,
        name,
        args,
      },
    ];
    return { callId: id, events };
  }

  nameOf(callId: string): string {
    return this.namesByCallId.get(callId) ?? UNKNOWN_TOOL_NAME;
  }

  /** A `choices` event when the finished call is the brain's AskUserQuestion tool. */
  choicesFor(callId: string, args: unknown): NootEvent[] {
    if (this.nameOf(callId) !== ASK_USER_QUESTION_TOOL_NAME) {
      return [];
    }
    const choices = choicesFromAskUserQuestionArgs(this.sequence, args);
    return choices ? [choices] : [];
  }
}
