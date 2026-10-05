/** Maps a brain session id to the Claude session id used for `resume`. */
export class SessionHandleStore {
  private readonly brainToClaudeSession = new Map<string, string>();

  remember(brainSessionId: string, claudeSessionId: string): void {
    if (!brainSessionId || !claudeSessionId) {
      return;
    }
    this.brainToClaudeSession.set(brainSessionId, claudeSessionId);
  }

  claudeSessionIdFor(brainSessionId: string): string | undefined {
    return this.brainToClaudeSession.get(brainSessionId);
  }

  /** Drops a handle the CLI no longer recognizes, so the next turn starts fresh instead of failing forever. */
  forget(brainSessionId: string): void {
    this.brainToClaudeSession.delete(brainSessionId);
  }
}
