import type { ChatToolCall } from './chat-state.js';

export function ToolCallRow({ tool }: { tool: ChatToolCall }) {
  return (
    <div className="noot-tool-row" role="status">
      <strong>{tool.name}</strong>
      <span>{tool.status}</span>
      {tool.message ? <span>{tool.message}</span> : null}
    </div>
  );
}
