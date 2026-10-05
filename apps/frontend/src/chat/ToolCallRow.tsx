import type { ReactElement } from 'react';
import type { ChatToolCall } from './chat-state.js';

export function ToolCallRow({ tool }: { tool: ChatToolCall }): ReactElement {
  return (
    <div className="noot-tool-row" role="status">
      <strong>{tool.name}</strong>
      <span>{tool.status}</span>
      {tool.message ? <span>{tool.message}</span> : null}
    </div>
  );
}
