import type { ReactElement } from 'react';

interface ThinkingPanelProps {
  text: string;
  defaultOpen?: boolean;
}

export function ThinkingPanel({
  text,
  defaultOpen = false,
}: ThinkingPanelProps): ReactElement | null {
  if (!text) {
    return null;
  }
  return (
    <details className="noot-thinking" open={defaultOpen}>
      <summary>Thinking</summary>
      <p>{text}</p>
    </details>
  );
}
