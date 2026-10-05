import type { ChoiceOption } from '@noot/shared';

interface ChoicesBarProps {
  prompt?: string;
  options: ChoiceOption[];
  disabled: boolean;
  onSelect: (option: ChoiceOption) => void;
}

export function ChoicesBar({ prompt, options, disabled, onSelect }: ChoicesBarProps) {
  if (options.length === 0) {
    return null;
  }
  return (
    <div className="noot-choices" role="group" aria-label={prompt ?? 'Choices'}>
      {prompt ? <p className="noot-status">{prompt}</p> : null}
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className="noot-btn"
          disabled={disabled}
          title={option.description}
          onClick={() => onSelect(option)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
