import { useState } from 'react';
import type { CacheReport } from './cacheReport';
import './CacheFailureButton.css';

export interface CacheFailureButtonProps {
  /** Gathers the report. Async because it probes a real render URL. */
  report: () => Promise<CacheReport>;
  /** Puts both upper rungs back to a cold start. Called AFTER the report is
   *  built, since it destroys the evidence the report is made of. */
  reset: () => void;
}

/** Says what happened to the wall's image ladder, then tries to unstick it.
 *
 *  One button, not "diagnose" then "fix": pressed in the wrong order, the
 *  diagnosis is lost. */
export function CacheFailureButton({ report, reset }: CacheFailureButtonProps) {
  const [state, setState] = useState<{ report: CacheReport; copied: boolean }
                                     | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const got = await report();
      const json = JSON.stringify(got, null, 2);
      // The console copy always lands; the clipboard needs a permission and a
      // focused document.
      console.warn('[wall] cache failure report\n' + json);
      let copied = false;
      try {
        await navigator.clipboard.writeText(json);
        copied = true;
      } catch { /* console has it */ }
      setState({ report: got, copied });
      reset();
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="wall-cachefail">
      <button type="button" className="wall-action" disabled={busy}
              onClick={() => { void run(); }}>
        {busy ? 'Checking…' : 'Cache failure'}
      </button>
      {state && (
        <div className="wall-cachefail__out" role="status">
          <p className="wall-cachefail__head">
            {state.report.ladder.rung} rung at{' '}
            {state.report.camera.cellPx.toFixed(0)}px cells
            {' · '}
            {state.copied ? 'JSON copied' : 'JSON in the console'}
            {' · caches reset'}
          </p>
          <ul>
            {state.report.findings.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <button type="button" className="wall-cachefail__close"
                  onClick={() => setState(null)}>Dismiss</button>
        </div>
      )}
    </span>
  );
}
