"use client";

import { useEffect, useRef, useState } from "react";
import { AeroPanel } from "@/components/panels/AeroPanel";
import { CompareTable } from "@/components/panels/CompareTable";
import { Diagnostics, DiagnosticsBadge } from "@/components/panels/Diagnostics";
import { ErrorPanel } from "@/components/panels/ErrorPanel";
import { MissionConfig } from "@/components/panels/MissionConfig";
import { Telemetry } from "@/components/panels/Telemetry";
import { EventStrip } from "@/components/timeline/EventStrip";
import { ScheduleEditor } from "@/components/timeline/ScheduleEditor";
import { ThrottleLever } from "@/components/timeline/ThrottleLever";
import { PlaybackDriver, Timeline } from "@/components/timeline/Timeline";
import { Brand } from "@/components/ui/Brand";
import { Button } from "@/components/ui/Button";
import { KeyMap } from "@/components/ui/KeyMap";
import { RoundTripSparkline, RunButton } from "@/components/ui/SolveStatus";
import { CollapseTab, HDivider, useResizable, VDivider } from "@/components/ui/Split";
import { Scene } from "@/components/viewport/Scene";
import { fixed } from "@/lib/format";
import { runToCsv } from "@/lib/playback";
import { useSim } from "@/lib/store";
import type { MissionSpec } from "@/lib/types";

export default function Console() {
  const run = useSim((s) => s.run);
  const ghost = useSim((s) => s.ghost);
  const showGhost = useSim((s) => s.showGhost);
  const spec = useSim((s) => s.spec);
  const resetSpec = useSim((s) => s.resetSpec);
  const loadSpec = useSim((s) => s.loadSpec);
  const promoteToGhost = useSim((s) => s.promoteToGhost);
  const clearGhost = useSim((s) => s.clearGhost);
  const collapsed = useSim((s) => s.collapsed);
  const toggleCollapsed = useSim((s) => s.toggleCollapsed);
  const diagnosticsOpen = useSim((s) => s.diagnosticsOpen);
  const setDiagnosticsOpen = useSim((s) => s.setDiagnosticsOpen);
  const setKeymapOpen = useSim((s) => s.setKeymapOpen);
  const connectBroadcast = useSim((s) => s.connectBroadcast);
  useEffect(() => connectBroadcast(), [connectBroadcast]);

  const left = useResizable(300, 220, 520, "left");
  const right = useResizable(370, 280, 620, "right");
  const track = useResizable(304, 170, 520, "track");
  const [trackTab, setTrackTab] = useState<"schedule" | "compare">("schedule");
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!ghost) setTrackTab("schedule");
  }, [ghost]);

  return (
    <main className="relative flex h-dvh w-dvw flex-col overflow-hidden bg-void">
      <PlaybackDriver />
      <KeyMap />

      <header className="flex h-11 shrink-0 items-center gap-4 rule-b bg-panel px-3">
        <Brand />
        <span className="num text-[11px] text-dim">
          {spec.label} &middot; {spec.config_name}
        </span>
        {run && (
          <span className="num text-[10px] text-dim">
            {run.summary.n_samples} samples &middot; solver {fixed(run.summary.solve_ms, 0)} ms
          </span>
        )}
        <RoundTripSparkline />
        <div className="ml-auto flex items-center gap-1.5">
          <DiagnosticsBadge onClick={() => setDiagnosticsOpen(!diagnosticsOpen)} />
          <Button onClick={() => setKeymapOpen(true)} title="Keyboard map  [?]">
            ?
          </Button>
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
            title="Hold the current run as a reference and compare the next one against it"
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
          <RunButton />
        </div>
      </header>

      <ErrorPanel />
      {diagnosticsOpen && <Diagnostics onClose={() => setDiagnosticsOpen(false)} />}

      <div className="flex min-h-0 flex-1">
        {collapsed.left ? (
          <CollapsedRail
            side="left"
            label="mission config"
            onToggle={() => toggleCollapsed("left")}
          />
        ) : (
          <>
            <div style={{ width: left.size }} className="flex min-h-0 shrink-0 flex-col">
              <MissionConfig />
            </div>
            <VDivider onDrag={left.drag} onReset={left.reset} />
          </>
        )}

        <div className="relative min-w-0 flex-1">
          <Scene />
          <div className="pointer-events-auto absolute bottom-2 right-2 flex gap-1">
            <CollapseTab
              side="left"
              collapsed={collapsed.left}
              onToggle={() => toggleCollapsed("left")}
              label="mission config"
            />
            <CollapseTab
              side="bottom"
              collapsed={collapsed.track}
              onToggle={() => toggleCollapsed("track")}
              label="the chart track"
            />
            <CollapseTab
              side="right"
              collapsed={collapsed.right}
              onToggle={() => toggleCollapsed("right")}
              label="aerodynamics"
            />
          </div>
        </div>

        {collapsed.right ? (
          <CollapsedRail
            side="right"
            label="aerodynamics"
            onToggle={() => toggleCollapsed("right")}
          />
        ) : (
          <>
            <VDivider onDrag={(dx) => right.drag(-dx)} onReset={right.reset} />
            <div style={{ width: right.size }} className="flex min-h-0 shrink-0 flex-col">
              <AeroPanel />
            </div>
          </>
        )}
      </div>

      {!collapsed.track && (
        <>
          <HDivider onDrag={(dy) => track.drag(-dy)} onReset={track.reset} />
          <div style={{ height: track.size }} className="flex shrink-0 bg-panel">
            <ThrottleLever />
            <div className="min-w-0 flex-1">
              <Telemetry height={track.size} />
            </div>
            <div className="flex w-[310px] shrink-0 flex-col rule-l">
              <div className="flex shrink-0 gap-px rule-b px-2 py-1">
                {(["schedule", "compare"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={k === "compare" && !ghost}
                    onClick={() => setTrackTab(k)}
                    className={`hit h-5 px-1.5 text-[10px] disabled:opacity-40 ${
                      trackTab === k ? "bg-bright text-void" : "text-dim hover:text-bright"
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {trackTab === "compare" && ghost ? (
                  <div className="p-2">
                    <CompareTable />
                  </div>
                ) : (
                  <ScheduleEditor height={Math.max(60, track.size - 78)} />
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <EventStrip />
      <Timeline />
    </main>
  );
}

function CollapsedRail({
  side,
  label,
  onToggle,
}: {
  side: "left" | "right";
  label: string;
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex w-7 shrink-0 flex-col items-center gap-2 bg-panel py-2 ${
        side === "left" ? "rule-r" : "rule-l"
      }`}
    >
      <CollapseTab side={side} collapsed onToggle={onToggle} label={label} />
      <span
        className="tracked whitespace-nowrap text-[9px] text-dim"
        style={{ writingMode: "vertical-rl" }}
      >
        {label}
      </span>
    </div>
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
