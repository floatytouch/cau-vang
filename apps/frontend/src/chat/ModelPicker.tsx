import type { EngineSummary } from '@noot/shared';
import { modelsForEngine } from '../config/engine-models.js';

interface ModelPickerProps {
  engines: EngineSummary[];
  engineId: string;
  model: string;
  disabled?: boolean;
  onChange: (engineId: string, model: string) => void;
}

export function ModelPicker({ engines, engineId, model, disabled, onChange }: ModelPickerProps) {
  const models = modelsForEngine(engineId);
  return (
    <div className="noot-toolbar" role="group" aria-label="Model picker">
      <label className="noot-status">
        Engine{' '}
        <select
          className="noot-select"
          aria-label="Engine"
          value={engineId}
          disabled={disabled || engines.length === 0}
          onChange={(event) => {
            const nextEngine = event.target.value;
            const nextModels = modelsForEngine(nextEngine);
            onChange(nextEngine, nextModels[0] ?? model);
          }}
        >
          {engines.map((engine) => (
            <option key={engine.id} value={engine.id}>
              {engine.id}
            </option>
          ))}
        </select>
      </label>
      <label className="noot-status">
        Model{' '}
        <select
          className="noot-select"
          aria-label="Model"
          value={model}
          disabled={disabled || models.length === 0}
          onChange={(event) => onChange(engineId, event.target.value)}
        >
          {models.includes(model) ? null : <option value={model}>{model}</option>}
          {models.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
