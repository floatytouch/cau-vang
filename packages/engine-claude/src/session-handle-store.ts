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
}
