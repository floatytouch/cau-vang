import { CONVERSATION_MODES, type ConversationMode } from '@noot/shared';

interface ModeToggleProps {
  mode: ConversationMode;
  disabled?: boolean;
  onChange: (mode: ConversationMode) => void;
}

export function ModeToggle({ mode, disabled, onChange }: ModeToggleProps) {
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
            {value === 'plan' ? 'Plan' : 'Auto'}
          </option>
        ))}
      </select>
    </label>
  );
}
