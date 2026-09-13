import { DEFAULT_CHROME } from './palette';
import type { TintDef } from './schema';
import { ramp, STEPS, type RampName } from './tint';
import './TintScale.css';

/** The ends alone leave a log ramp looking linear; the midpoint shows it is not. */
const TICKS = [0, 0.5, 1];

export interface TintScaleProps {
  tint: TintDef<any>;
  gradient: RampName;
  /** The tone an item with no value wears. */
  unmatched?: string;
}

/** What the wall's colors mean while a measured tint is on. Read-only, since
 *  every other legend row is a filter; `STEPS` swatches, since the ramp is
 *  quantized and a smooth strip would label bands the wall cannot draw. */
export function TintScale({ tint, gradient,
                            unmatched = DEFAULT_CHROME.unmatched.fill }: TintScaleProps) {
  const swatches = Array.from({ length: STEPS }, (_, i) => i / (STEPS - 1));
  const tick = (t: number) => tint.format(tint.at(t));

  return (
    <section className="wall-tint-scale">
      <div className="wall-tint-scale-head">
        <strong>{tint.scaleLabel}</strong>
        {tint.log && <span className="wall-tint-scale-note">log</span>}
      </div>
      <div className="wall-tint-scale-strip" role="img"
           aria-label={`${tint.scaleLabel}, ${tick(0)} to ${tick(1)}`
                       + (tint.log ? ', logarithmic' : '')}>
        {swatches.map((t) => (
          <span key={t} className="wall-tint-scale-swatch"
                style={{ background: ramp(t, gradient) }} />
        ))}
      </div>
      <div className="wall-tint-scale-ticks" aria-hidden="true">
        {TICKS.map((t) => <span key={t}>{tick(t)}</span>)}
      </div>
      <div className="wall-tint-scale-absent">
        <span className="wall-tint-scale-swatch" style={{ background: unmatched }} />
        <span>not measured</span>
      </div>
    </section>
  );
}
