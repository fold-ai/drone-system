"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { fixed } from "@/lib/format";
import { useRecords } from "@/lib/recordsStore";
import { useSim } from "@/lib/store";

/**
 * Save the current solve as a test record.
 *
 * A name is required. An unnamed row in a run library is worse than no row: it
 * costs storage, appears in every list, and tells nobody what it was for.
 */
export function SaveRecord() {
  const run = useSim((s) => s.run);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [pinned, setPinned] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const save = useRecords((s) => s.save);
  const saving = useRecords((s) => s.saving);
  const error = useRecords((s) => s.saveError);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open && run) {
      setName(`${run.spec.label} ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
      setDone(null);
    }
  }, [open, run]);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={!run}
        title="Save this solve to the run library with a name and notes"
      >
        record
      </Button>

      {open && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-void/80"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-[420px] border border-rule bg-panel p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between gap-8 rule-b pb-2">
              <span className="tracked text-[11px] text-bright">Save to the run library</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="hit text-[10px] text-dim hover:text-bright"
              >
                close
              </button>
            </div>

            {run && (
              <p className="num pt-2 text-[10px] text-dim">
                {fixed(run.summary.ground_range_km, 1)} km &middot;{" "}
                {fixed(run.summary.endurance_s, 0)} s &middot; L/D {fixed(run.summary.best_ld, 2)}{" "}
                &middot; {run.summary.n_samples} samples &middot; solver{" "}
                {run.summary.solver_version}
              </p>
            )}

            <label className="mt-3 block">
              <span className="text-[10px] uppercase tracking-[0.1em] text-dim">Name</span>
              <input
                type="text"
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full px-2 py-1 text-[12px]"
              />
            </label>

            <label className="mt-2 block">
              <span className="text-[10px] uppercase tracking-[0.1em] text-dim">
                Notes, what this run was for
              </span>
              <textarea
                value={notes}
                rows={3}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full resize-none border border-rule bg-void px-2 py-1 text-[12px] text-bright"
              />
            </label>

            <label className="mt-2 flex items-center gap-2" title="Pinned runs are never pruned">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
              />
              <span className="text-[11px] text-dim">
                Pin this trajectory so pruning never takes it
              </span>
            </label>

            {!run?.encoded && (
              <p className="mt-2 text-[10px] leading-snug text-alert">
                This run came from another tab and carries no encoded trajectory. The summary
                will be saved without the sample history.
              </p>
            )}
            {error && <p className="mt-2 text-[11px] text-alert">{error}</p>}
            {done && (
              <p className="mt-2 text-[11px] text-dim">
                Saved as <span className="num text-bright">{done.slice(0, 8)}</span>.
              </p>
            )}

            <div className="mt-3 flex gap-1">
              <Button
                variant="primary"
                disabled={saving || !name.trim() || !run}
                onClick={async () => {
                  if (!run) return;
                  const id = await save({ name: name.trim(), notes: notes.trim(), run, pinned });
                  if (id) {
                    setDone(id);
                    setNotes("");
                  }
                }}
              >
                {saving ? "Saving" : "Save"}
              </Button>
              <Button onClick={() => setOpen(false)}>Close</Button>
              <a
                href="/admin-pro/runs"
                className="hit ml-auto self-center border border-rule px-1.5 py-0.5 text-[10px] text-dim hover:border-dim hover:text-bright"
              >
                run library
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
