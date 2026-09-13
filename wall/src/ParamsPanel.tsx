import { useMemo } from 'react';
import { ControlPanel, fromConfigFields } from '@weasel-js/labkit';
import type { ParamSchema, Params } from './params';
import './ParamsPanel.css';

export interface ParamsPanelProps {
  schema: Pick<ParamSchema, 'groups' | 'units'>;
  params: Params;
  setParam: <K extends keyof Params>(key: K, value: Params[K]) => void;
  reset: () => void;
}

/** The wall's tuning constants, inline in the sidebar beside the filters. */
export function ParamsPanel({ schema, params, setParam, reset }: ParamsPanelProps) {
  // Resolved rather than handed over as `fields`: only the resolved shape
  // carries a unit, which the row draws as `suffix`.
  const schemas = useMemo(() => schema.groups.map((group) => {
    const resolved = fromConfigFields(group.fields);
    for (const [key, unit] of Object.entries(schema.units)) {
      const leaf = resolved.group.children[key] as { suffix?: string } | undefined;
      if (leaf) leaf.suffix = unit;
    }
    return { label: group.label, resolved };
  }), [schema]);

  return (
    <div className="wall-params-panel">
      <h3>
        Params
        <button type="button" onClick={reset}>reset</button>
      </h3>
      <div className="wall-params-body">
        {schemas.map(({ label, resolved }) => (
          <section key={label} className="wall-params-group">
            <h4>{label}</h4>
            <ControlPanel
              schema={resolved}
              config={params as unknown as Record<string, unknown>}
              setConfig={(key, value) => setParam(key as keyof Params, value as never)}
            />
          </section>
        ))}
      </div>
    </div>
  );
}
