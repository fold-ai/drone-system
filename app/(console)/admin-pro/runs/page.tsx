"use client";

import { useEffect, useState } from "react";
import { RunDiff } from "@/components/records/RunDiff";
import { RunTable } from "@/components/records/RunTable";
import { Brand } from "@/components/ui/Brand";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { useResizable, VDivider } from "@/components/ui/Split";
import { useRecords, visibleRows } from "@/lib/recordsStore";

/**
 * The run library.
 *
 * Every solve worth keeping ends up here with a name, notes and the solver
 * version that produced it. Loading one back into the console re-solves its
 * specification with today's solver rather than replaying an old answer;
 * holding one as a reference replays exactly what was recorded, labelled with
 * the version it came from.
 */
export default function Runs() {
  const right = useResizable(460, 340, 720, "runs-right");
  const refresh = useRecords((s) => s.refresh);
  const rows = useRecords((s) => s.rows);
  const filter = useRecords((s) => s.filter);
  const setFilter = useRecords((s) => s.setFilter);
  const feasibleOnly = useRecords((s) => s.feasibleOnly);
  const setFeasibleOnly = useRecords((s) => s.setFeasibleOnly);
  const kind = useRecords((s) => s.kind);
  const setKind = useRecords((s) => s.setKind);
  const selected = useRecords((s) => s.selected);
  const error = useRecords((s) => s.error);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const shown = visibleRows(rows, filter);

  /** Hand a record to the console. The console picks it up on mount. */
  const handOff = (id: string, as: "spec" | "ref") => {
    setBusy(as);
    try {
      window.sessionStorage.setItem("act1.record", JSON.stringify({ id, as }));
    } catch {
      /* private mode; the console will simply not find it */
    }
    window.location.href = "/admin-pro";
  };

  return (
    <main className="flex h-dvh w-dvw flex-col overflow-hidden bg-void">
      <header className="flex h-11 shrink-0 items-center gap-4 rule-b bg-panel px-3">
        <Brand product="RUN LIBRARY" nav="runs" />
        <input
          type="search"
          value={filter}
          placeholder="filter by name, solver or commit"
          onChange={(e) => setFilter(e.target.value)}
          className="w-64 px-2 py-0.5 text-[11px]"
        />
        <div className="flex items-center gap-1">
          <Button
            active={kind === "single"}
            onClick={() => setKind("single")}
            title="Runs saved deliberately from the console"
          >
            saved
          </Button>
          <Button
            active={kind === "optimisation"}
            onClick={() => setKind("optimisation")}
            title="Every design the optimiser evaluated, including the rejected ones"
          >
            optimiser
          </Button>
          <Button active={kind === null} onClick={() => setKind(null)} title="Both">
            everything
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button active={feasibleOnly === null} onClick={() => setFeasibleOnly(null)}>
            any
          </Button>
          <Button active={feasibleOnly === true} onClick={() => setFeasibleOnly(true)}>
            feasible
          </Button>
          <Button active={feasibleOnly === false} onClick={() => setFeasibleOnly(false)}>
            infeasible
          </Button>
        </div>
        <span className="num text-[10px] text-dim">
          {shown.length} of {rows.length} runs
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            disabled={selected.length !== 1 || busy !== ""}
            onClick={() => handOff(selected[0], "spec")}
            title="Load this configuration into the console and solve it again with today's solver"
          >
            load into console
          </Button>
          <Button
            disabled={selected.length !== 1 || busy !== ""}
            onClick={() => handOff(selected[0], "ref")}
            title="Send this recorded run to the console as the comparison reference"
          >
            hold as ref
          </Button>
          <Button onClick={() => void refresh()}>refresh</Button>
        </div>
      </header>

      {error && (
        <p className="rule-b bg-panel px-3 py-1.5 text-[11px] text-alert">{error}</p>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Panel title="RECORDS" scroll>
            <RunTable />
          </Panel>
        </div>
        <VDivider onDrag={(dx) => right.drag(-dx)} onReset={right.reset} />
        <div style={{ width: right.size }} className="flex min-h-0 shrink-0 flex-col rule-l">
          <RunDiff />
        </div>
      </div>
    </main>
  );
}
