import {
  CONVERSATION_MODE_AUTO,
  CONVERSATION_MODE_PLAN,
  CONVERSATION_MODES,
  type ConversationMode,
} from '@noot/shared';
import type { ReactElement } from 'react';

const MODE_LABELS: Record<ConversationMode, string> = {
  [CONVERSATION_MODE_AUTO]: 'Auto',
  [CONVERSATION_MODE_PLAN]: 'Plan',
};

interface ModeToggleProps {
  mode: ConversationMode;
  disabled?: boolean;
  onChange: (mode: ConversationMode) => void;
}

export function ModeToggle({ mode, disabled, onChange }: ModeToggleProps): ReactElement {
  return (
    <label className="noot-status">
      Mode{' '}
      <select
        className="noot-mode"
        aria-label="Conversation mode"
        value={mode}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as ConversationMode)}
      >
        {CONVERSATION_MODES.map((value) => (
          <option key={value} value={value}>
            {MODE_LABELS[value]}
          </option>
        ))}
      </select>
    </label>
  );
}
