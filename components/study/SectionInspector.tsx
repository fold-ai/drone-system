"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Readout } from "@/components/ui/Readout";
import { css } from "@/lib/colormap";
import { fixed, signed } from "@/lib/format";
import { useStudy } from "@/lib/studyStore";
import { XYPlot, type Series } from "./XYPlot";

const SCHRENK = css(0.6);
const ELLIPTIC = css(0.28);
const CHORD = css(0.86);

/**
 * Section inspector.
 *
 * A station along the span, its local geometry, and the span load against an
 * elliptical reference of the same area. Where the two diverge is where the
 * planform departs from ideal loading: too much lift outboard costs root
 * bending and stalls the tip early, too little wastes span.
 *
 * The load is a Schrenk approximation - the mean of the chord distribution and
 * the ellipse - not a lifting-line solve, and it is labelled as such. Twist is
 * carried by the geometry but is not fed to the drag polar, which has no
 * spanwise resolution.
 */
export function SectionInspector() {
  const planform = useStudy((s) => s.planform);
  const run = useStudy((s) => s.run);
  const spec = useStudy((s) => s.spec);
  const [eta, setEta] = useState(0.6);

  useEffect(() => {
    void run("planform");
  }, [run, spec]);

  const series = useMemo<{ load: Series[]; chord: Series[] } | null>(() => {
    if (!planform) return null;
    return {
      load: [
        { label: "Schrenk", colour: SCHRENK, points: planform.stations.map((s) => [s.eta, s.schrenk_load]) },
        {
          label: "elliptical",
          colour: ELLIPTIC,
          dash: [4, 3],
          points: planform.stations.map((s) => [s.eta, s.elliptic_load]),
        },
      ],
      chord: [
        { label: "chord", colour: CHORD, points: planform.stations.map((s) => [s.eta, s.chord_m]) },
      ],
    };
  }, [planform]);

  if (!planform || !series) {
    return (
      <Panel title="Section inspector">
        <p className="p-3 text-[11px] text-dim">No planform yet.</p>
      </Panel>
    );
  }

  const i = Math.round(eta * (planform.stations.length - 1));
  const st = planform.stations[i];
  const worst = planform.stations
    .slice(0, -1)
    .reduce((a, b) => (Math.abs(b.departure) > Math.abs(a.departure) ? b : a));

  return (
    <Panel
      title="Section inspector"
      right={<span className="num text-[10px] text-dim">estimate, not a lifting-line solve</span>}
    >
      <div className="p-2">
        <div className="flex items-center gap-2 pb-2">
          <span className="text-[10px] text-dim">station</span>
          <input
            type="range"
            min={0}
            max={1}
            step={1 / (planform.stations.length - 1)}
            value={eta}
            onChange={(e) => setEta(Number(e.target.value))}
            className="min-w-0 flex-1"
          />
          <span className="num w-[104px] shrink-0 text-right text-[11px]">
            eta {fixed(st.eta, 3)} &middot; {fixed(st.y_m, 3)} m
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <XYPlot
              series={series.load}
              height={190}
              xLabel="eta"
              yLabel="load / mean chord"
              marks={[
                {
                  x: st.eta,
                  y: st.schrenk_load,
                  label: `${signed(st.departure * 100, 0)}%`,
                  colour: "#ffffff",
                },
              ]}
              xDomain={[0, 1]}
            />
            <div className="mt-1 flex gap-3 text-[10px] text-dim">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-[2px] w-3" style={{ background: SCHRENK }} />
                Schrenk
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-[2px] w-3"
                  style={{
                    backgroundImage: `repeating-linear-gradient(90deg, ${ELLIPTIC} 0 4px, transparent 4px 7px)`,
                  }}
                />
                elliptical
              </span>
            </div>
          </div>

          <div>
            <XYPlot
              series={series.chord}
              height={190}
              xLabel="eta"
              yLabel="chord  m"
              marks={[{ x: st.eta, y: st.chord_m, label: "", colour: "#ffffff" }]}
              xDomain={[0, 1]}
            />
            <div className="mt-1 space-y-0.5">
              <Readout label="local chord" value={st.chord_m} unit="m" decimals={3} width={7} />
              <Readout label="thickness" value={st.thickness_frac * 100} unit="% c" decimals={1} width={7} />
              <Readout label="twist" value={st.twist_deg} unit="deg" decimals={2} width={7} sign />
              <Readout
                label="departure from elliptical"
                value={st.departure * 100}
                unit="%"
                decimals={1}
                width={7}
                sign
                alert={Math.abs(st.departure) > 0.25}
              />
            </div>
          </div>
        </div>

        <p className="mt-2 text-[10px] leading-snug text-dim">
          Span load is a Schrenk approximation, the mean of the chord distribution and an ellipse
          of the same area. It is not a lifting-line solve. Worst departure is{" "}
          {signed(worst.departure * 100, 0)}% at eta {fixed(worst.eta, 2)}: the planform carries{" "}
          {worst.departure > 0 ? "more" : "less"} lift there than ideal loading would.
        </p>
        <p className="mt-1 text-[10px] leading-snug text-dim">
          Twist is geometry only. The drag polar has no spanwise resolution, so washout changes the
          picture here and nothing in the solved drag.
        </p>
      </div>
    </Panel>
  );
}
