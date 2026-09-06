"use client";

import { useEffect, useRef } from "react";
import { fixed, signed } from "@/lib/format";
import { sampleAt } from "@/lib/playback";
import { useSim } from "@/lib/store";

const R = 46;
const DEG_PER_PX = 1.6;

/**
 * Attitude gnomon.
 *
 * Once the aircraft is a few dozen pixels across, its attitude is unreadable
 * from the model itself. This is the instrument that carries it: a flight-path
 * ladder banked with the aircraft, the velocity vector on that ladder, a
 * heading rose, and the body axis triad.
 *
 * The solver is a 3-DOF point mass. Thrust acts along the velocity vector and
 * there is no angle-of-attack state, so the body axis and the velocity vector
 * are the same line by construction. That is stated on the instrument rather
 * than papered over with an invented alpha.
 */
export function Gnomon() {
  const ladder = useRef<SVGGElement>(null);
  const banked = useRef<SVGGElement>(null);
  const rose = useRef<SVGGElement>(null);
  const fpv = useRef<SVGGElement>(null);
  const gamma = useRef<HTMLSpanElement>(null);
  const heading = useRef<HTMLSpanElement>(null);
  const bank = useRef<HTMLSpanElement>(null);
  const speed = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const write = (t: number) => {
      const { run } = useSim.getState();
      if (!run) return;
      const s = sampleAt(run, t);
      if (banked.current) banked.current.setAttribute("transform", `rotate(${-s.bank_deg})`);
      if (ladder.current) {
        ladder.current.setAttribute("transform", `translate(0 ${s.gamma_deg / DEG_PER_PX})`);
      }
      if (rose.current) rose.current.setAttribute("transform", `rotate(${-s.psi_deg})`);
      if (fpv.current) {
        // The velocity vector sits on the horizon by definition here, so the
        // marker stays centred and the ladder moves under it.
        fpv.current.setAttribute("transform", "translate(0 0)");
      }
      if (gamma.current) gamma.current.textContent = signed(s.gamma_deg, 1, 6);
      if (heading.current) heading.current.textContent = fixed(s.psi_deg, 1, 5);
      if (bank.current) bank.current.textContent = signed(s.bank_deg, 1, 6);
      if (speed.current) speed.current.textContent = fixed(s.v_tas_ms, 1, 6);
    };
    write(useSim.getState().t);
    return useSim.subscribe((s) => write(s.t));
  }, []);

  const rungs = [-45, -30, -20, -10, 10, 20, 30, 45];

  return (
    <div className="border border-rule bg-void/85 px-2 py-1.5">
      <div className="tracked mb-1 text-[9px] text-dim">Attitude</div>
      <div className="flex items-start gap-2">
        <svg width={R * 2 + 4} height={R * 2 + 4} viewBox={`${-R - 2} ${-R - 2} ${R * 2 + 4} ${R * 2 + 4}`}>
          <defs>
            <clipPath id="gnomon-clip">
              <circle cx="0" cy="0" r={R} />
            </clipPath>
          </defs>
          <circle cx="0" cy="0" r={R} fill="#050608" stroke="#1c1c1c" />
          <g clipPath="url(#gnomon-clip)">
            <g ref={banked}>
              <g ref={ladder}>
                {/* ground half, so up and down are unambiguous */}
                <rect x={-R * 2} y="0" width={R * 4} height={R * 4} fill="#0E1319" />
                <line x1={-R * 1.6} y1="0" x2={R * 1.6} y2="0" stroke="#8B94A0" strokeWidth="1" />
                {rungs.map((d) => {
                  const y = -d / DEG_PER_PX;
                  const w = Math.abs(d) >= 30 ? 10 : 16;
                  return (
                    <g key={d}>
                      <line x1={-w} y1={y} x2={w} y2={y} stroke="#4A525C" strokeWidth="1" />
                      <text
                        x={w + 3}
                        y={y + 3}
                        fill="#6B6B6B"
                        fontSize="7"
                        fontFamily="var(--font-jetbrains-mono), monospace"
                      >
                        {Math.abs(d)}
                      </text>
                    </g>
                  );
                })}
              </g>
            </g>
          </g>
          {/* Fixed flight-path marker. Body axis and velocity vector coincide. */}
          <g ref={fpv}>
            <circle cx="0" cy="0" r="4.5" fill="none" stroke="#ffffff" strokeWidth="1.3" />
            <line x1="-11" y1="0" x2="-4.5" y2="0" stroke="#ffffff" strokeWidth="1.3" />
            <line x1="4.5" y1="0" x2="11" y2="0" stroke="#ffffff" strokeWidth="1.3" />
            <line x1="0" y1="-4.5" x2="0" y2="-9" stroke="#ffffff" strokeWidth="1.3" />
          </g>
        </svg>

        <div className="flex flex-col items-center gap-1">
          <svg width="46" height="46" viewBox="-23 -23 46 46">
            <circle cx="0" cy="0" r="21" fill="#050608" stroke="#1c1c1c" />
            <g ref={rose}>
              {[0, 90, 180, 270].map((d) => (
                <g key={d} transform={`rotate(${d})`}>
                  <line x1="0" y1="-21" x2="0" y2="-16" stroke="#6B6B6B" strokeWidth="1" />
                  <text
                    x="0"
                    y="-10"
                    fill="#6B6B6B"
                    fontSize="7"
                    textAnchor="middle"
                    fontFamily="var(--font-jetbrains-mono), monospace"
                  >
                    {d === 0 ? "E" : d === 90 ? "N" : d === 180 ? "W" : "S"}
                  </text>
                </g>
              ))}
            </g>
            <path d="M0 -13 L4 6 L0 2 L-4 6 Z" fill="#ffffff" />
          </svg>
          <span className="text-[8px] uppercase tracking-[0.1em] text-dim">track</span>
        </div>
      </div>

      <div className="mt-1.5 space-y-0.5">
        {[
          ["FPA", gamma, "deg"],
          ["TRK", heading, "deg"],
          ["BNK", bank, "deg"],
          ["TAS", speed, "m/s"],
        ].map(([label, ref, unit]) => (
          <div key={label as string} className="flex items-baseline justify-between gap-2">
            <span className="text-[9px] text-dim">{label as string}</span>
            <span className="flex items-baseline gap-1">
              <span ref={ref as React.RefObject<HTMLSpanElement>} className="num text-[10px]">
                --
              </span>
              <span className="w-6 text-[8px] text-dim">{unit as string}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="mt-1 max-w-[150px] text-[8px] leading-tight text-dim">
        3-DOF point mass: the body axis is the velocity vector. Angle of attack is not
        a state of this model.
      </p>
    </div>
  );
}
