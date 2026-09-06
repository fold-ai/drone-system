"use client";

import { useMemo } from "react";
import { Panel } from "@/components/ui/Panel";
import { Readout } from "@/components/ui/Readout";
import { css } from "@/lib/colormap";
import { fixed } from "@/lib/format";
import { useStudy } from "@/lib/studyStore";
import { XYPlot, type Series } from "./XYPlot";

const POLAR = css(0.42);
const TANGENT = css(0.86);
const LD = css(0.58);
const OPERATING = "#ffffff";

/**
 * Drag polar and lift-to-drag.
 *
 * The tangent from the origin is the whole point of drawing a polar: its
 * gradient is L/D max, and where it touches is the lift coefficient that
 * achieves it. Beside it, L/D against Mach shows how far the cruise condition
 * sits from that optimum, which for this airframe is a long way.
 *
 * When the console has a trajectory loaded, its mid-flight operating point is
 * marked on both plots.
 */
export function PolarChart() {
  const polar = useStudy((s) => s.polar);
  const spec = useStudy((s) => s.spec);
  const operating = useStudy((s) => s.operating);

  const data = useMemo(() => {
    if (!polar) return null;
    const polarSeries: Series[] = [
      { label: "polar", colour: POLAR, points: polar.polar.map((p) => [p.cd, p.cl]) },
    ];
    const ldSeries: Series[] = [
      { label: "L/D", colour: LD, points: polar.ld_vs_mach.map((p) => [p[0], p[1]]) },
    ];
    return { polarSeries, ldSeries };
  }, [polar]);

  if (!polar || !data) {
    return (
      <Panel title="Polar and L/D">
        <p className="p-3 text-[11px] text-dim">No result yet.</p>
      </Panel>
    );
  }

  const cruiseIdx = polar.breakdown.reduce(
    (best, p, i) =>
      Math.abs(p.mach - spec.mission.target_mach) <
      Math.abs(polar.breakdown[best].mach - spec.mission.target_mach)
        ? i
        : best,
    0,
  );
  const cruise = polar.breakdown[cruiseIdx];

  return (
    <Panel
      title="Polar and L/D"
      right={
        <span className="num text-[10px] text-dim">
          {operating ? `operating point from ${operating.label}` : "no trajectory broadcast"}
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-2 p-2">
        <div>
          <XYPlot
            series={data.polarSeries}
            height={210}
            xLabel="CD"
            yLabel="CL"
            tangent={{
              x: polar.cd_at_ld_max,
              y: polar.cl_at_ld_max,
              colour: TANGENT,
              label: `L/D max ${fixed(polar.ld_max, 2)}`,
            }}
            marks={[
              {
                x: polar.cd_at_ld_max,
                y: polar.cl_at_ld_max,
                label: "",
                colour: TANGENT,
              },
              {
                x: cruise.cd_total,
                y: cruise.cl,
                label: `cruise M ${fixed(cruise.mach, 2)}`,
                colour: OPERATING,
                hollow: true,
              },
              ...(operating
                ? [
                    {
                      x: operating.cd,
                      y: operating.cl,
                      label: "flown",
                      colour: OPERATING,
                    },
                  ]
                : []),
            ]}
          />
          <p className="mt-1 text-[10px] leading-snug text-dim">
            The tangent from the origin touches the polar at CL{" "}
            {fixed(polar.cl_at_ld_max, 3)}; its gradient is L/D max. Cruise sits far below and
            left of it.
          </p>
        </div>

        <div>
          <XYPlot
            series={data.ldSeries}
            height={210}
            xLabel="Mach"
            yLabel="L/D"
            marks={[
              {
                x: polar.mach_at_ld_max,
                y: polar.ld_max,
                label: `best ${fixed(polar.mach_at_ld_max, 3)}`,
                colour: TANGENT,
              },
              {
                x: cruise.mach,
                y: cruise.ld,
                label: "cruise",
                colour: OPERATING,
                hollow: true,
              },
              ...(operating
                ? [{ x: operating.mach, y: operating.ld, label: "flown", colour: OPERATING }]
                : []),
            ]}
          />
          <div className="mt-1 space-y-0.5 px-0.5">
            <Readout label="L/D max" value={polar.ld_max} decimals={2} width={7} />
            <Readout label="best L/D speed" value={polar.v_at_ld_max_ms} unit="m/s" decimals={1} width={7} />
            <Readout label="best L/D Mach" value={polar.mach_at_ld_max} unit="M" decimals={3} width={7} />
            <Readout label="L/D at cruise Mach" value={cruise.ld} decimals={2} width={7} />
            <Readout
              label="cruise as a share of best"
              value={(cruise.ld / Math.max(1e-9, polar.ld_max)) * 100}
              unit="%"
              decimals={0}
              width={7}
              alert={cruise.ld / Math.max(1e-9, polar.ld_max) < 0.4}
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}
