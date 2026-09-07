"use client";

import { useEffect } from "react";
import { Panel } from "@/components/ui/Panel";
import { fixed } from "@/lib/format";
import { useBench } from "@/lib/benchStore";

/** Everything imported so far, with how far the model was from each set. */
export function ImportLibrary() {
  const rows = useBench((s) => s.imports);
  const loading = useBench((s) => s.loadingImports);
  const refresh = useBench((s) => s.refreshImports);
  const open = useBench((s) => s.openImport);
  const remove = useBench((s) => s.removeImport);
  const savedId = useBench((s) => s.savedId);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Panel
      title="IMPORTED DATA"
      scroll
      right={<span className="num text-[10px] text-dim">{rows.length}</span>}
    >
      {loading && !rows.length && <p className="p-3 text-[11px] text-dim">Reading.</p>}
      {!loading && !rows.length && (
        <p className="p-3 text-[11px] leading-snug text-dim">
          Nothing imported yet. A simulator that has never been compared with a measurement is a
          drawing.
        </p>
      )}
      <ul className="flex flex-col">
        {rows.map((r) => {
          const bias = r.bias === null ? null : Number(r.bias);
          const rms = r.rms === null ? null : Number(r.rms);
          return (
            <li
              key={r.id}
              className={`rule-b px-3 py-2 ${savedId === r.id ? "bg-void" : ""}`}
            >
              <div className="flex items-baseline gap-2">
                <button
                  type="button"
                  onClick={() => void open(r.id)}
                  className="hit min-w-0 flex-1 truncate text-left text-[11px] text-bright hover:underline"
                  title="Show the stored residuals"
                >
                  {r.source}
                </button>
                <span className="num shrink-0 text-[9px] text-dim">{r.kind}</span>
                <button
                  type="button"
                  onClick={() => void remove(r.id)}
                  className="hit shrink-0 text-[9px] text-dim hover:text-alert"
                  title="Delete this import and its validation points"
                >
                  delete
                </button>
              </div>
              <div className="num flex flex-wrap gap-x-3 text-[10px] text-dim">
                <span>{r.n_points} points</span>
                <span>{r.quantity ?? "-"}</span>
                {bias !== null && (
                  <span className={Math.abs(bias) > 0 ? "" : ""}>
                    bias {bias > 0 ? "+" : ""}
                    {fixed(bias, 4)} {r.unit ?? ""}
                  </span>
                )}
                {rms !== null && <span>rms {fixed(rms, 4)}</span>}
                <span>{new Date(r.uploaded_at).toISOString().slice(0, 10)}</span>
              </div>
              {r.notes && (
                <p className="truncate text-[10px] text-dim" title={r.notes}>
                  {r.notes}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
