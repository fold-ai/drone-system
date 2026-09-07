"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Panel, SubHead } from "@/components/ui/Panel";
import { useBench } from "@/lib/benchStore";

/**
 * Bringing a measurement in.
 *
 * The mapping is offered as a guess and confirmed by a person. Reading a column
 * called "Thrust" as newtons when the stand wrote pounds-force is a 4.45x error
 * that makes the model look badly wrong, so the guess is always visible and
 * always changeable.
 */
export function ImportPanel() {
  const s = useBench();
  const file = useRef<HTMLInputElement>(null);
  const quantity = s.quantities.find((q) => q.key === s.quantity);
  const roles = quantity
    ? [
        { key: quantity.key, label: quantity.label, unit: quantity.unit, required: true,
          measured: true, hint: "" },
        ...quantity.conditions.map((c) => ({
          key: c.key, label: c.label, unit: c.unit, required: c.required,
          measured: false,
          hint: c.default !== null ? `defaults to ${c.default}` : "",
        })),
      ]
    : [];
  const ready = roles.every((r) => s.mapping[r.key] || !r.required || r.hint);

  return (
    <Panel title="IMPORT" scroll bodyClassName="pb-4">
      <div className="flex items-center gap-1 p-3">
        <Button onClick={() => file.current?.click()}>choose CSV</Button>
        {s.fileName && (
          <span className="num min-w-0 truncate text-[10px] text-dim" title={s.fileName}>
            {s.fileName}
          </span>
        )}
        {s.fileName && (
          <Button variant="ghost" className="ml-auto" onClick={() => s.reset()}>
            clear
          </Button>
        )}
        <input
          ref={file}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) await s.acceptFile(f.name, await f.text());
            e.target.value = "";
          }}
        />
      </div>

      {s.error && <p className="px-3 pb-2 text-[11px] leading-snug text-alert">{s.error}</p>}

      {s.header.length > 0 && (
        <>
          <SubHead>Quantity measured</SubHead>
          <div className="grid grid-cols-2 gap-1 px-3">
            {s.quantities.map((q) => (
              <Button
                key={q.key}
                active={s.quantity === q.key}
                onClick={() => s.setQuantity(q.key)}
                className="justify-start"
                title={q.note}
              >
                {q.label}
              </Button>
            ))}
          </div>

          <SubHead>Columns</SubHead>
          <div className="flex flex-col gap-1.5 px-3">
            {roles.map((r) => (
              <label key={r.key} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[11px] text-dim" title={r.hint}>
                  {r.label}
                  {r.measured && <span className="ml-1 text-[9px] text-bright">measured</span>}
                  {r.unit && <span className="ml-1 text-[9px] text-dim">{r.unit}</span>}
                </span>
                <select
                  value={s.mapping[r.key] ?? ""}
                  onChange={(e) => s.setMapping(r.key, e.target.value)}
                  className="w-40 shrink-0 border border-rule bg-void px-1 py-0.5 text-[11px] text-bright"
                >
                  <option value="">{r.hint || "not mapped"}</option>
                  {s.header.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p className="px-3 pt-1 text-[10px] leading-snug text-dim">
            Units are read from the column name where it carries one: kg/h, g/s, lbf, kN, ft, kt
            and percent are all understood. Check the numbers below before trusting the residuals.
          </p>

          {s.preview.length > 1 && (
            <>
              <SubHead>First rows, as read</SubHead>
              <pre className="num mx-3 overflow-x-auto border border-rule bg-void p-2 text-[10px] leading-relaxed text-dim">
                {s.preview.slice(0, 6).join("\n")}
              </pre>
            </>
          )}

          <SubHead>Model configuration</SubHead>
          <label className="flex items-center gap-2 px-3">
            <span
              className="min-w-0 flex-1 truncate text-[11px] text-dim"
              title="The airframe the model is evaluated for. Engine data does not depend on it."
            >
              Assumed length
            </span>
            <input
              type="number"
              min={1.2}
              max={3.2}
              step={0.05}
              value={s.spec.airframe.length_m}
              onChange={(e) => s.setSpecLength(Number(e.target.value))}
              className="num w-20 shrink-0 px-1 text-right text-[11px]"
            />
          </label>

          <div className="flex gap-1 px-3 pt-3">
            <Button
              variant="primary"
              disabled={!ready || s.phase === "comparing"}
              onClick={() => void s.compare()}
            >
              {s.phase === "comparing" ? "Comparing" : "Compare with the model"}
            </Button>
          </div>
        </>
      )}

      {s.comparison && s.csv && (
        <>
          <SubHead>Keep this import</SubHead>
          <div className="flex flex-col gap-1.5 px-3">
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-dim">Where it came from</span>
              <input
                type="text"
                value={s.source}
                placeholder="stand 2, JetCat P160 s/n 4471"
                onChange={(e) => s.setField("source", e.target.value)}
                className="px-2 py-0.5 text-[11px]"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-dim">When it was recorded</span>
              <input
                type="date"
                value={s.recordedAt}
                onChange={(e) => s.setField("recordedAt", e.target.value)}
                className="px-2 py-0.5 text-[11px]"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-dim">Notes</span>
              <textarea
                rows={2}
                value={s.notes}
                onChange={(e) => s.setField("notes", e.target.value)}
                className="resize-none border border-rule bg-void px-2 py-1 text-[11px] text-bright"
              />
            </label>
            <div className="flex items-center gap-1 pt-1">
              <Button
                disabled={!s.source.trim() || s.phase === "saving"}
                onClick={() => void s.save()}
              >
                {s.phase === "saving" ? "Saving" : "Save import"}
              </Button>
              {s.savedId && (
                <span className="num text-[10px] text-dim">
                  saved {s.savedId.slice(0, 8)}
                </span>
              )}
            </div>
            <p className="text-[10px] leading-snug text-dim">
              The file is stored as uploaded, with the mapping beside it, so the residuals can be
              traced back to the sheet that produced them.
            </p>
          </div>
        </>
      )}
    </Panel>
  );
}
