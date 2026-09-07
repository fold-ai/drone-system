"use client";

import { Panel, SubHead } from "@/components/ui/Panel";
import { fixed } from "@/lib/format";
import { useBench, type Comparison } from "@/lib/benchStore";

/**
 * Model against measurement.
 *
 * The scatter is drawn against the measurement, so a perfect model lies on the
 * diagonal and a bias is a parallel offset rather than something to be read out
 * of a statistic. The residual plot beneath it shows the shape of the error,
 * which is what says whether the model is wrong or merely offset.
 */
export function Residuals() {
  const c = useBench((s) => s.comparison);
  const phase = useBench((s) => s.phase);

  if (phase === "comparing") {
    return (
      <Panel title="RESIDUALS">
        <p className="p-3 text-[11px] text-dim">Solving at each measured condition.</p>
      </Panel>
    );
  }
  if (!c) {
    return (
      <Panel title="RESIDUALS">
        <p className="p-3 text-[11px] leading-snug text-dim">
          Load a CSV, say which column holds which quantity, and the model is evaluated at every
          measured condition.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="RESIDUALS"
      scroll
      right={<span className="num text-[10px] text-dim">{c.n} points</span>}
    >
      <Statistics c={c} />
      {c.note && <p className="px-3 pb-2 text-[10px] leading-snug text-dim">{c.note}</p>}
      <Scatter c={c} />
      <ResidualPlot c={c} />
      <Table c={c} />
      {c.skipped.length > 0 && (
        <>
          <SubHead>Rows not used</SubHead>
          <ul className="px-3 pb-3">
            {c.skipped.map((s, i) => (
              <li key={i} className="text-[10px] text-alert">
                {s}
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

function Statistics({ c }: { c: Comparison }) {
  const dec = Math.abs(c.bias) < 0.01 ? 5 : 3;
  return (
    <>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 p-3">
        <Stat
          label="Bias, model minus measured"
          value={`${c.bias > 0 ? "+" : ""}${fixed(c.bias, dec)}`}
          sub={`${c.bias_pct > 0 ? "+" : ""}${fixed(c.bias_pct, 2)}%`}
          unit={c.unit}
          alert={Math.abs(c.bias_pct) > 10}
        />
        <Stat
          label="RMS error"
          value={fixed(c.rms, dec)}
          sub={`${fixed(c.rms_pct, 2)}%`}
          unit={c.unit}
          alert={c.rms_pct > 15}
        />
        <Stat label="Largest error" value={fixed(c.max_abs, dec)} unit={c.unit} />
        <Stat
          label="Variance explained"
          value={fixed(c.r2, 4)}
          alert={c.r2 < 0.9}
          sub={c.r2 < 0 ? "worse than the mean of the data" : undefined}
        />
      </div>
      {Math.abs(c.bias_pct) > 5 && (
        <p className="mx-3 mb-2 border border-alert px-2 py-1.5 text-[10px] leading-snug text-alert">
          The model reads {fixed(Math.abs(c.bias_pct), 1)}% {c.bias > 0 ? "high" : "low"} on
          average against this data. A bias that size is a calibration to make, not noise to
          average out.
        </p>
      )}
    </>
  );
}

function Stat({
  label, value, sub, unit, alert = false,
}: { label: string; value: string; sub?: string; unit?: string; alert?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[10px] text-dim">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={`num text-[14px] ${alert ? "text-alert" : "text-bright"}`}>{value}</span>
        {unit && <span className="text-[9px] text-dim">{unit}</span>}
        {sub && <span className="num text-[10px] text-dim">{sub}</span>}
      </div>
    </div>
  );
}

/** Model against measurement. A perfect model is the diagonal. */
function Scatter({ c }: { c: Comparison }) {
  if (!c.rows.length) return null;
  const vals = c.rows.flatMap((r) => [r.measured, r.model]);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.06 || 1;
  const a = lo - pad;
  const b = hi + pad;
  const S = 150;
  const x = (v: number) => ((v - a) / (b - a)) * S;
  const y = (v: number) => S - ((v - a) / (b - a)) * S;

  return (
    <>
      <SubHead right={<span className="text-[9px] text-dim">{c.unit}</span>}>
        Model against measurement
      </SubHead>
      <div className="px-3 pb-2">
        <svg viewBox={`-2 -2 ${S + 4} ${S + 4}`} className="h-44 w-44 border border-rule">
          <line
            x1={x(a)} y1={y(a)} x2={x(b)} y2={y(b)}
            stroke="currentColor" strokeWidth="0.5" className="text-dim"
            strokeDasharray="2 2"
          />
          {c.rows.map((r, i) => (
            <circle
              key={i}
              cx={x(r.measured)}
              cy={y(r.model)}
              r="1.8"
              className={Math.abs(r.residual_pct) > 10 ? "fill-alert" : "fill-bright"}
            >
              <title>
                {`measured ${fixed(r.measured, 4)}, model ${fixed(r.model, 4)}, ` +
                  `residual ${fixed(r.residual, 4)} (${fixed(r.residual_pct, 1)}%)`}
              </title>
            </circle>
          ))}
        </svg>
        <div className="flex justify-between pt-0.5 text-[9px] text-dim">
          <span className="num">{fixed(a, 3)}</span>
          <span>measured &rarr;</span>
          <span className="num">{fixed(b, 3)}</span>
        </div>
      </div>
    </>
  );
}

/** Residual against the first condition, which is the one that was swept. */
function ResidualPlot({ c }: { c: Comparison }) {
  if (c.rows.length < 2) return null;
  const key = Object.keys(c.rows[0].condition)[0];
  if (!key) return null;
  const xs = c.rows.map((r) => r.condition[key]);
  const rs = c.rows.map((r) => r.residual);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const m = Math.max(...rs.map(Math.abs)) || 1;
  const W = 260;
  const H = 56;
  const px = (v: number) => (x1 === x0 ? W / 2 : ((v - x0) / (x1 - x0)) * W);
  const py = (v: number) => H / 2 - (v / m) * (H / 2 - 3);

  return (
    <>
      <SubHead right={<span className="num text-[9px] text-dim">&plusmn;{fixed(m, 4)}</span>}>
        Residual against {key.replace(/_/g, " ")}
      </SubHead>
      <div className="px-3 pb-3">
        {/* Stems rather than points: the plot is stretched to the panel width,
            which would draw a circle as an ellipse, and a vertical line reads
            correctly at any horizontal scale. */}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-14 w-full border border-rule"
          preserveAspectRatio="none"
        >
          <line
            x1={0} y1={H / 2} x2={W} y2={H / 2}
            stroke="currentColor" strokeWidth="1" className="text-dim"
            vectorEffect="non-scaling-stroke"
          />
          {c.rows.map((r, i) => (
            <line
              key={i}
              x1={px(r.condition[key])}
              y1={H / 2}
              x2={px(r.condition[key])}
              y2={py(r.residual)}
              stroke="currentColor"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              className={Math.abs(r.residual_pct) > 10 ? "text-alert" : "text-bright"}
            >
              <title>
                {`${key.replace(/_/g, " ")} ${fixed(r.condition[key], 3)}: ` +
                  `${fixed(r.residual, 4)} (${fixed(r.residual_pct, 1)}%)`}
              </title>
            </line>
          ))}
        </svg>
        <div className="flex justify-between pt-0.5 text-[9px] text-dim">
          <span className="num">{fixed(x0, 3)}</span>
          <span>{key.replace(/_/g, " ")}</span>
          <span className="num">{fixed(x1, 3)}</span>
        </div>
      </div>
    </>
  );
}

function Table({ c }: { c: Comparison }) {
  const keys = c.rows.length ? Object.keys(c.rows[0].condition) : [];
  return (
    <>
      <SubHead>Every point</SubHead>
      <div className="overflow-x-auto px-3 pb-3">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="rule-b text-dim">
              {keys.map((k) => (
                <th key={k} className="px-1 py-0.5 text-right font-normal">
                  {k.replace(/_/g, " ")}
                </th>
              ))}
              <th className="px-1 py-0.5 text-right font-normal">measured</th>
              <th className="px-1 py-0.5 text-right font-normal">model</th>
              <th className="px-1 py-0.5 text-right font-normal">residual</th>
              <th className="px-1 py-0.5 text-right font-normal">%</th>
            </tr>
          </thead>
          <tbody>
            {c.rows.map((r) => (
              <tr key={r.row} className="align-baseline">
                {keys.map((k) => (
                  <td key={k} className="num px-1 py-0.5 text-right text-dim">
                    {fixed(r.condition[k], 3)}
                  </td>
                ))}
                <td className="num px-1 py-0.5 text-right text-dim">{fixed(r.measured, 4)}</td>
                <td className="num px-1 py-0.5 text-right text-bright">{fixed(r.model, 4)}</td>
                <td
                  className={`num px-1 py-0.5 text-right ${
                    Math.abs(r.residual_pct) > 10 ? "text-alert" : "text-bright"
                  }`}
                >
                  {r.residual > 0 ? "+" : ""}
                  {fixed(r.residual, 4)}
                </td>
                <td className="num px-1 py-0.5 text-right text-dim">
                  {r.residual_pct > 0 ? "+" : ""}
                  {fixed(r.residual_pct, 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
