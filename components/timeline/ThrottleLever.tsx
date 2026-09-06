"use client";

import { useEffect, useRef, useState } from "react";
import { Lever } from "@/components/ui/Slider";
import { fixed, pct } from "@/lib/format";
import { sampleAt } from "@/lib/playback";
import { useSim } from "@/lib/store";

/**
 * Live throttle control.
 *
 * Releasing the lever writes a breakpoint into the throttle schedule at the
 * current playback time and re-solves from that state forward. Commanded and
 * actual throttle are separate states in the solver; both are shown, and the
 * gap between them is the spool lag.
 */
export function ThrottleLever() {
  const run = useSim((s) => s.run);
  const setThrottleAt = useSim((s) => s.setThrottleAt);
  const spliceStatus = useSim((s) => s.spliceStatus);
  const [held, setHeld] = useState<number | null>(null);
  const cmdRef = useRef<HTMLSpanElement>(null);
  const actRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(0);

  useEffect(() => {
    const read = (t: number) => {
      if (!run) return;
      const s = sampleAt(run, t);
      if (cmdRef.current) cmdRef.current.textContent = pct(s.throttle_cmd, 1);
      if (actRef.current) actRef.current.textContent = pct(s.throttle_act, 1);
      if (barRef.current) barRef.current.style.width = `${(s.throttle_act * 100).toFixed(2)}%`;
      setLive(s.throttle_cmd);
    };
    read(useSim.getState().t);
    return useSim.subscribe((s) => read(s.t));
  }, [run]);

  const value = held ?? live;

  return (
    <div className="flex h-full shrink-0 gap-3 rule-r px-3 py-2">
      <Lever
        value={value}
        disabled={!run || spliceStatus === "solving"}
        onChange={setHeld}
        onCommit={(v) => {
          setHeld(null);
          if (run) void setThrottleAt(useSim.getState().t, v);
        }}
        height={150}
      />
      <div className="flex w-[132px] flex-col justify-between">
        <div>
          <div className="tracked text-[10px] text-dim">Throttle</div>
          <div className="mt-1 h-2 border border-rule bg-void">
            <div ref={barRef} className="h-full bg-bright" style={{ width: "0%" }} />
          </div>
          <div className="mt-2 space-y-0.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-dim">commanded</span>
              <span ref={cmdRef} className="num text-[12px]">
                {pct(0, 1)}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-dim">actual</span>
              <span ref={actRef} className="num text-[12px] text-dim">
                {pct(0, 1)}
              </span>
            </div>
            {held !== null && (
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] text-dim">holding</span>
                <span className="num text-[12px]">{pct(held, 1)}</span>
              </div>
            )}
          </div>
        </div>
        <p className="text-[10px] leading-tight text-dim">
          {spliceStatus === "solving"
            ? "Re-solving from the cursor."
            : run
              ? `Release writes a node at the cursor and re-solves forward. Last round trip ${fixed(run.roundTripMs, 0)} ms.`
              : "Run a mission to enable the lever."}
        </p>
      </div>
    </div>
  );
}
