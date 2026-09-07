"use client";

import { useEffect, useState } from "react";
import { AeroBody } from "@/components/panels/AeroPanel";
import { Brand } from "@/components/ui/Brand";
import { clock, fixed } from "@/lib/format";
import * as bc from "@/lib/broadcast";
import { useSim } from "@/lib/store";

/**
 * Detached aerodynamics window.
 *
 * Mirrors the main console's playback cursor and solved run over a
 * BroadcastChannel and does no solving of its own. Intended for a second
 * monitor during a test review.
 */
export default function AeroWindow() {
  const run = useSim((s) => s.run);
  const [connected, setConnected] = useState(false);
  const [t, setT] = useState(0);

  useEffect(() => {
    const ch = bc.open();
    if (!ch) return undefined;
    ch.onmessage = (ev: MessageEvent<bc.Message>) => {
      const msg = ev.data;
      if (msg.kind === "cursor") {
        setConnected(true);
        setT(msg.t);
        useSim.setState({ t: msg.t, playing: msg.playing, speed: msg.speed });
      } else if (msg.kind === "run") {
        setConnected(true);
        useSim.setState({
          run: msg.payload ? bc.deserialiseRun(msg.payload) : null,
          status: msg.payload ? "ready" : "idle",
        });
      }
    };
    ch.postMessage({ kind: "hello" } satisfies bc.Message);
    return () => ch.close();
  }, []);

  return (
    <main className="flex h-dvh w-dvw flex-col overflow-hidden bg-void">
      <header className="flex h-11 shrink-0 items-center gap-3 rule-b bg-panel px-3">
        <Brand product={null} />
        <span className="tracked text-[11px] font-semibold">Aerodynamics</span>
        <span className="num ml-auto text-[11px] text-dim">{clock(t)}</span>
        <span className="num text-[10px] text-dim">
          {run ? `${run.spec.label} · ${fixed(run.summary.max_mach, 3)} max M` : ""}
        </span>
      </header>
      {run ? (
        <div className="min-h-0 flex-1 overflow-y-auto bg-panel">
          <AeroBody />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center px-8 text-center text-[11px] text-dim">
          {connected
            ? "Waiting for a trajectory. Press RUN in the main console."
            : "No console detected. Open this window from the detach control in the main console."}
        </div>
      )}
    </main>
  );
}
