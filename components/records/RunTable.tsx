"use client";

import { fixed } from "@/lib/format";
import { SORT_COLUMNS, useRecords, visibleRows, type RunRow } from "@/lib/recordsStore";

/**
 * The run library.
 *
 * Sorting happens in Postgres against a whitelisted column; the free-text
 * filter is applied here because it is cheap and the list is bounded. Ticking
 * two rows compares them.
 */
export function RunTable() {
  const rows = useRecords((s) => s.rows);
  const filter = useRecords((s) => s.filter);
  const sort = useRecords((s) => s.sort);
  const direction = useRecords((s) => s.direction);
  const setSort = useRecords((s) => s.setSort);
  const selected = useRecords((s) => s.selected);
  const toggleSelected = useRecords((s) => s.toggleSelected);
  const setPinned = useRecords((s) => s.setPinned);
  const loading = useRecords((s) => s.loading);
  const shown = visibleRows(rows, filter);

  if (loading && !rows.length) {
    return <p className="p-3 text-[11px] text-dim">Reading the library.</p>;
  }
  if (!shown.length) {
    return (
      <p className="p-3 text-[11px] leading-snug text-dim">
        {rows.length
          ? "Nothing matches that filter."
          : "No runs saved yet. Solve something on the console and press record."}
      </p>
    );
  }

  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-[11px]">
        <thead>
          <tr className="rule-b">
            <th className="w-6" />
            <th className="px-2 py-1 text-left text-[10px] uppercase tracking-[0.1em] text-dim">
              Name
            </th>
            {SORT_COLUMNS.filter((c) => c.key !== "created_at").map((c) => (
              <Th
                key={c.key}
                label={c.label}
                active={sort === c.key}
                direction={direction}
                onClick={() => setSort(c.key)}
              />
            ))}
            <Th
              label="Saved"
              active={sort === "created_at"}
              direction={direction}
              onClick={() => setSort("created_at")}
            />
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const on = selected.includes(r.id);
            const rank = selected.indexOf(r.id);
            return (
              <tr
                key={r.id}
                className={`rule-b align-baseline ${on ? "bg-void" : ""} hover:bg-void`}
              >
                <td className="px-2 py-1">
                  <button
                    type="button"
                    onClick={() => toggleSelected(r.id)}
                    title={on ? "Remove from the comparison" : "Add to the comparison"}
                    className={`hit inline-block h-2.5 w-2.5 border ${
                      on ? "border-bright bg-bright" : "border-rule hover:border-dim"
                    }`}
                  />
                </td>
                <td className="max-w-[280px] px-2 py-1">
                  <div className="truncate text-bright" title={r.name ?? ""}>
                    {rank >= 0 && (
                      <span className="num mr-1 text-[9px] text-dim">
                        {rank === 0 ? "A" : "B"}
                      </span>
                    )}
                    {r.name ?? "unnamed"}
                  </div>
                  <div className="num truncate text-[9px] text-dim">
                    {r.solver_version}
                    {r.git_sha ? ` · ${r.git_sha.slice(0, 7)}` : ""}
                    {r.warning_count > 0 ? ` · ${r.warning_count} warnings` : ""}
                    {r.has_trajectory ? "" : " · summary only"}
                  </div>
                </td>
                <Td value={r.range_km} decimals={1} alert={!r.feasible} />
                <Td value={r.endurance_s} decimals={0} />
                <Td value={r.ld_max} decimals={2} />
                <Td value={r.max_mach} decimals={3} />
                <Td value={r.v_rail_exit_ms} decimals={1} />
                <Td value={r.max_load_factor} decimals={2} />
                <Td value={r.warning_count} decimals={0} alert={r.warning_count > 0} />
                <td className="num px-2 py-1 text-right text-dim">
                  {new Date(r.created_at).toISOString().slice(0, 16).replace("T", " ")}
                </td>
                <td className="px-2 py-1 text-right">
                  <button
                    type="button"
                    title="Pinned runs are never pruned"
                    onClick={() => void setPinned(r.id, true)}
                    className="hit text-[10px] text-dim hover:text-bright"
                  >
                    pin
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  label, active, direction, onClick,
}: { label: string; active: boolean; direction: "asc" | "desc"; onClick: () => void }) {
  return (
    <th className="px-2 py-1 text-right">
      <button
        type="button"
        onClick={onClick}
        className={`hit text-[10px] uppercase tracking-[0.1em] ${
          active ? "text-bright" : "text-dim hover:text-bright"
        }`}
      >
        {label}
        {active && <span className="num ml-1">{direction === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}

function Td({
  value, decimals = 2, alert = false,
}: { value: number | null; decimals?: number; alert?: boolean }) {
  return (
    <td
      className={`num px-2 py-1 text-right ${
        alert ? "text-alert" : value === null ? "text-dim" : "text-bright"
      }`}
    >
      {value === null ? "–" : fixed(value, decimals)}
    </td>
  );
}

export type { RunRow };
