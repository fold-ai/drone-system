"use client";

import type { ReactNode } from "react";
import { fixed, signed } from "@/lib/format";

/**
 * A labelled number. The value reserves a fixed character count so digits do
 * not shift while the trajectory plays. `alert` is applied only when the value
 * is genuinely out of limits.
 */
export function Readout({
  label,
  value,
  unit,
  decimals = 2,
  width = 7,
  sign = false,
  alert = false,
  dim = false,
  title,
}: {
  label: string;
  value: number | null | undefined;
  unit?: string;
  decimals?: number;
  width?: number;
  sign?: boolean;
  alert?: boolean;
  dim?: boolean;
  title?: string;
}) {
  const text = sign ? signed(value, decimals, width) : fixed(value, decimals, width);
  return (
    <div className="flex items-baseline justify-between gap-2" title={title}>
      <span className="truncate text-[11px] text-dim">{label}</span>
      <span className="flex shrink-0 items-baseline gap-1">
        <span
          className={`num text-[12px] ${
            alert ? "text-alert" : dim ? "text-dim" : "text-bright"
          }`}
        >
          {text}
        </span>
        {unit && <span className="w-8 shrink-0 text-[10px] text-dim">{unit}</span>}
      </span>
    </div>
  );
}

export function TextRow({
  label,
  value,
  alert = false,
  title,
}: {
  label: string;
  value: ReactNode;
  alert?: boolean;
  title?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2" title={title}>
      <span className="truncate text-[11px] text-dim">{label}</span>
      <span className={`text-[11px] ${alert ? "text-alert" : "text-bright"}`}>{value}</span>
    </div>
  );
}

/** Pass / fail state. The only place a chromatic colour is allowed. */
export function Verdict({ ok, pass = "PASS", fail = "FAIL" }: { ok: boolean; pass?: string; fail?: string }) {
  return (
    <span className={`num text-[11px] ${ok ? "text-bright" : "text-alert"}`}>
      {ok ? pass : fail}
    </span>
  );
}
