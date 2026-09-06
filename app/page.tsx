"use client";

import { useEffect, useRef, useState } from "react";
import { AeroPanel } from "@/components/panels/AeroPanel";
import { MissionConfig } from "@/components/panels/MissionConfig";
import { Telemetry } from "@/components/panels/Telemetry";
import { ScheduleEditor } from "@/components/timeline/ScheduleEditor";
import { ThrottleLever } from "@/components/timeline/ThrottleLever";
import { PlaybackDriver, Timeline } from "@/components/timeline/Timeline";
import { Brand } from "@/components/ui/Brand";
import { Button } from "@/components/ui/Button";
import { HDivider, useResizable, VDivider } from "@/components/ui/Split";
import { Scene } from "@/components/viewport/Scene";
import { clock, fixed } from "@/lib/format";
import { runToCsv } from "@/lib/playback";
import { useSim } from "@/lib/store";
import type { MissionSpec } from "@/lib/types";

export default function Console() {
  const status = useSim((s) => s.status);
  const run = useSim((s) => s.run);
  const ghost = useSim((s) => s.ghost);
  const showGhost = useSim((s) => s.showGhost);
  const error = useSim((s) => s.error);
  const errorDetail = useSim((s) => s.errorDetail);
  const spec = useSim((s) => s.spec);
  const runNow = useSim((s) => s.run_);
  const resetSpec = useSim((s) => s.resetSpec);
  const loadSpec = useSim((s) => s.loadSpec);
  const promoteToGhost = useSim((s) => s.promoteToGhost);
  const clearGhost = useSim((s) => s.clearGhost);

  const connectBroadcast = useSim((s) => s.connectBroadcast);
  useEffect(() => connectBroadcast(), [connectBroadcast]);

  const left = useResizable(300, 220, 520);
  const right = useResizable(370, 280, 620);
  const track = useResizable(304, 170, 520);
  const [showEvents, setShowEvents] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const warnings = run?.warnings ?? [];

  return (
    <main className="flex h-dvh w-dvw flex-col overflow-hidden bg-void">
      <PlaybackDriver />

      <header className="flex h-11 shrink-0 items-center gap-4 rule-b bg-panel px-3">
        <Brand />
        <span className="num text-[11px] text-dim">
          {spec.label} &middot; {spec.config_name}
        </span>
        {run && (
          <span className="num text-[10px] text-dim">
            {run.summary.n_samples} samples &middot; solver {fixed(run.summary.solve_ms, 0)} ms
            &middot; round trip {fixed(run.roundTripMs, 0)} ms
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {warnings.length > 0 && (
            <button
              type="button"
              onClick={() => setShowEvents((v) => !v)}
              className="hit h-6 border border-alert px-2 text-[11px] text-alert"
            >
              {warnings.length} {warnings.length === 1 ? "warning" : "warnings"}
            </button>
          )}
          {run && (
            <button
              type="button"
              onClick={() => setShowEvents((v) => !v)}
              className="hit h-6 border border-rule px-2 text-[11px] text-dim hover:text-bright"
            >
              events
            </button>
          )}
          <Button onClick={() => downloadJson(spec)} title="Save this configuration as JSON">
            save
          </Button>
          <Button onClick={() => file.current?.click()} title="Load a saved configuration">
            load
          </Button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                loadSpec(JSON.parse(await f.text()) as MissionSpec);
              } catch {
                /* an unreadable file is not a reason to lose the current one */
              }
              e.target.value = "";
            }}
          />
          <Button
            onClick={() => (ghost ? clearGhost() : promoteToGhost())}
            disabled={!run && !ghost}
            active={Boolean(ghost) && showGhost}
            title="Hold the current run as a reference and overlay it on the next one"
          >
            {ghost ? "clear ref" : "hold as ref"}
          </Button>
          <Button
            onClick={() => run && downloadCsv(run.label, runToCsv(run))}
            disabled={!run}
            title="Export the full 50 Hz trajectory"
          >
            csv
          </Button>
          <Button onClick={resetSpec} title="Return every parameter to its default">
            reset
          </Button>
          <Button
            variant="primary"
            onClick={() => void runNow()}
            disabled={status === "solving"}
            className="w-16"
          >
            {status === "solving" ? "solving" : "run"}
          </Button>
        </div>
      </header>

      {error && (
        <div className="flex shrink-0 items-start gap-3 rule-b border-alert bg-void px-3 py-1.5">
          <span className="tracked shrink-0 text-[10px] text-alert">Solver</span>
          <div className="min-w-0">
            <p className="text-[11px] text-alert">{error}</p>
            {errorDetail && (
              <pre className="num mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-[10px] text-dim">
                {errorDetail}
              </pre>
            )}
          </div>
        </div>
      )}

      {showEvents && run && (
        <div className="max-h-56 shrink-0 overflow-y-auto rule-b bg-panel px-3 py-2">
          {warnings.map((w) => (
            <p key={w} className="mb-1 flex gap-2 text-[11px] leading-snug text-alert">
              <span className="shrink-0">!</span>
              <span>{w}</span>
            </p>
          ))}
          <table className="mt-1 w-full">
            <tbody>
              {run.events.map((e, i) => (
                <tr key={`${e.kind}-${i}`} className="align-top">
                  <td className="num w-16 py-0.5 pr-3 text-[11px] text-dim">{clock(e.t)}</td>
                  <td
                    className={`w-40 py-0.5 pr-3 text-[11px] ${
                      e.severity === "alert" ? "text-alert" : "text-bright"
                    }`}
                  >
                    {e.label}
                  </td>
                  <td className="py-0.5 text-[11px] text-dim">{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div style={{ width: left.size }} className="flex min-h-0 shrink-0 flex-col">
          <MissionConfig />
        </div>
        <VDivider onDrag={left.drag} onReset={left.reset} />
        <div className="min-w-0 flex-1">
          <Scene />
        </div>
        <VDivider onDrag={(dx) => right.drag(-dx)} onReset={right.reset} />
        <div style={{ width: right.size }} className="flex min-h-0 shrink-0 flex-col">
          <AeroPanel />
        </div>
      </div>

      <HDivider onDrag={(dy) => track.drag(-dy)} onReset={track.reset} />

      <div style={{ height: track.size }} className="flex shrink-0 bg-panel">
        <ThrottleLever />
        <div className="min-w-0 flex-1">
          <Telemetry height={track.size} />
        </div>
        <div className="w-[300px] shrink-0 rule-l">
          <ScheduleEditor height={Math.max(60, track.size - 46)} />
        </div>
      </div>

      <Timeline />
    </main>
  );
}

function downloadJson(spec: MissionSpec) {
  const blob = new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" });
  trigger(blob, `act1-${spec.label.toLowerCase().replace(/\s+/g, "-")}-config.json`);
}

function downloadCsv(label: string, csv: string) {
  trigger(
    new Blob([csv], { type: "text/csv" }),
    `act1-${label.toLowerCase().replace(/\s+/g, "-")}-trajectory.csv`,
  );
}

function trigger(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
