import { useCallback, useEffect, useMemo, useState } from 'react';
import { paramCssVars, type ParamSchema, type Params, type ParamValue } from './params';

export interface UseParamsOptions {
  /** Where the params persist in `localStorage`. */
  storageKey: string;
  /** The custom property root the palette reads, e.g. `--wall`. */
  root: string;
}

export interface UseParamsResult {
  params: Params;
  setParam: <K extends keyof Params>(key: K, value: Params[K]) => void;
  reset: () => void;
}

function loadStored(schema: ParamSchema, storageKey: string): Params {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return schema.defaults;
    return { ...schema.defaults, ...(JSON.parse(raw) as Record<string, ParamValue>) };
  } catch {
    return schema.defaults;
  }
}

function persist(storageKey: string, params: Params): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(params));
  } catch {
    // A full or disabled store is not worth failing the wall over.
  }
}

/** The wall's tuning constants, persisted and resettable. A color param also
 *  writes its custom property onto `.lk-root`, where `readPalette` finds it;
 *  it lands there rather than on the document so `.lk-root`'s own value loses. */
export function useParams(schema: ParamSchema, { storageKey, root }: UseParamsOptions):
    UseParamsResult {
  const [params, setParams] = useState<Params>(() => loadStored(schema, storageKey));
  const vars = useMemo(() => paramCssVars(schema.states, root), [schema, root]);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>('.lk-root');
    if (el) {
      for (const key of schema.colorKeys) {
        const prop = vars[key];
        if (prop) el.style.setProperty(prop, String(params[key]));
      }
    }
    persist(storageKey, params);
  }, [params, schema, vars, storageKey]);

  const setParam = useCallback(<K extends keyof Params>(key: K, value: Params[K]) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => setParams(schema.defaults), [schema]);

  return { params, setParam, reset };
}
