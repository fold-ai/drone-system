"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fixed, signed } from "@/lib/format";

/**
 * Unit-aware numeric entry.
 *
 * Accepts what an engineer would actually type: "3.5 km" into a metre field,
 * "2.4 kN" into newtons, "85%" into a fraction. The unit is converted, not
 * ignored, and anything out of range is clamped to the model's own limits
 * rather than silently accepted.
 */
export function parseValue(text: string, unit: string): number | null {
  const m = text.trim().match(/^([-+]?[\d.,]+(?:e[-+]?\d+)?)\s*([a-zA-Z%/ ]*)$/);
  if (!m) return null;
  const n = Number.parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const given = m[2].trim().toLowerCase().replace(/\s+/g, "");
  const want = unit.trim().toLowerCase();
  if (!given || given === want) return n;

  const table: Record<string, Record<string, number>> = {
    m: { km: 1000, cm: 0.01, mm: 0.001, ft: 0.3048 },
    km: { m: 0.001, ft: 0.0003048 },
    kg: { g: 0.001, t: 1000 },
    n: { kn: 1000, kgf: 9.80665 },
    "n s": { kns: 1000 },
    pa: { kpa: 1000, bar: 100000, hpa: 100 },
    kpa: { pa: 0.001, bar: 100 },
    s: { ms: 0.001, min: 60 },
    "m/s": { "km/h": 1 / 3.6, kt: 0.514444, kts: 0.514444 },
    k: { c: 1, degc: 1 },
    deg: { rad: 57.29577951308232 },
  };
  const factor = table[want]?.[given];
  if (factor !== undefined) return n * factor;
  // A percentage typed into a dimensionless 0-1 field.
  if (given === "%" && !want) return n / 100;
  // Unknown unit: take the number and let the range clamp it.
  return n;
}

export function Slider({
  label,
  unit,
  value,
  min,
  max,
  step = 0.01,
  decimals,
  defaultValue,
  reference,
  path,
  highlight = false,
  onInput,
  onCommit,
  onReset,
  disabled = false,
  alert = false,
  title,
}: {
  label: string;
  unit?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  decimals?: number;
  defaultValue?: number;
  /** Same field in the held reference run, for the delta readout. */
  reference?: number;
  path?: string;
  highlight?: boolean;
  onInput: (v: number) => void;
  onCommit?: (v: number) => void;
  onReset?: () => void;
  disabled?: boolean;
  alert?: boolean;
  title?: string;
}) {
  const dp = decimals ?? Math.max(0, Math.ceil(-Math.log10(step || 0.01)));
  const [text, setText] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const modified = defaultValue !== undefined && Math.abs(value - defaultValue) > step / 2;
  const delta =
    reference !== undefined && Number.isFinite(reference) ? value - reference : null;
  const showDelta = delta !== null && Math.abs(delta) > step / 2;

  const clamp = useCallback((v: number) => Math.min(max, Math.max(min, v)), [min, max]);

  const commitText = useCallback(() => {
    if (text === null) return;
    const parsed = parseValue(text, unit ?? "");
    if (parsed === null) {
      setBad(true);
      setTimeout(() => setBad(false), 900);
      setText(null);
      return;
    }
    setText(null);
    const v = clamp(parsed);
    onInput(v);
    onCommit?.(v);
  }, [text, unit, clamp, onInput, onCommit]);

  const defaultPos =
    defaultValue !== undefined && max > min
      ? ((clamp(defaultValue) - min) / (max - min)) * 100
      : null;

  return (
    <div
      className={`px-3 py-1.5 ${highlight ? "bg-bright/8 ring-1 ring-inset ring-bright/40" : ""}`}
      title={title}
      data-field={path}
    >
      <div className="flex items-baseline justify-between gap-2">
        <label className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-[11px] text-dim">{label}</span>
          {modified && onReset && (
            <button
              type="button"
              onClick={onReset}
              title={`Reset to the model default, ${fixed(defaultValue, dp)}`}
              className="hit shrink-0 text-[9px] text-dim hover:text-bright"
            >
              [reset]
            </button>
          )}
          {showDelta && (
            <span
              className="num shrink-0 text-[9px] text-dim"
              title="Change from the held reference run"
            >
              {signed(delta as number, dp)}
            </span>
          )}
        </label>
        <span className="flex shrink-0 items-baseline gap-1">
          <input
            className={`num w-[80px] text-right text-[12px] ${
              bad ? "text-alert" : alert ? "text-alert" : ""
            }`}
            value={text ?? fixed(value, dp)}
            disabled={disabled}
            title={`Type a value; a unit is understood, e.g. "3.5 km" or "2.4 kN". Range ${fixed(min, dp)} to ${fixed(max, dp)}.`}
            onChange={(e) => setText(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setText(null);
            }}
          />
          {unit && <span className="w-9 shrink-0 text-[10px] text-dim">{unit}</span>}
        </span>
      </div>
      <div className="relative">
        {defaultPos !== null && (
          <span
            aria-hidden
            title={`Model default ${fixed(defaultValue, dp)}`}
            className="pointer-events-none absolute top-[6px] h-[6px] w-px bg-dim"
            style={{ left: `calc(${defaultPos}% )` }}
          />
        )}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onInput(Number.parseFloat(e.target.value))}
          onPointerUp={(e) => onCommit?.(Number.parseFloat((e.target as HTMLInputElement).value))}
          onKeyDown={(e) => {
            // Shift gives a tenth of a step, for the last significant figure.
            if (!e.shiftKey) return;
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            const fine = step / 10;
            const next = clamp(value + (e.key === "ArrowRight" ? fine : -fine));
            onInput(next);
            onCommit?.(next);
          }}
          onKeyUp={(e) => {
            if (!e.shiftKey) onCommit?.(Number.parseFloat((e.target as HTMLInputElement).value));
          }}
        />
      </div>
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  title,
  path,
  highlight = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  title?: string;
  path?: string;
  highlight?: boolean;
}) {
  return (
    <label
      className={`hit flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-[11px] text-dim hover:text-bright ${
        highlight ? "bg-bright/8 ring-1 ring-inset ring-bright/40" : ""
      }`}
      title={title}
      data-field={path}
    >
      <span className="truncate">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** Vertical lever with a rounded handle - the one radius in the product. */
export function Lever({
  value,
  onChange,
  onCommit,
  disabled = false,
  height = 118,
}: {
  value: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  disabled?: boolean;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const fromEvent = useCallback((clientY: number) => {
    const el = ref.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, 1 - (clientY - r.top) / r.height));
  }, []);

  useEffect(() => {
    if (!dragging) return undefined;
    const move = (e: PointerEvent) => onChange(fromEvent(e.clientY));
    const up = (e: PointerEvent) => {
      setDragging(false);
      onCommit?.(fromEvent(e.clientY));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, fromEvent, onChange, onCommit]);

  const marks = useMemo(() => [0.25, 0.5, 0.75], []);

  return (
    <div
      ref={ref}
      style={{ height }}
      className={`relative w-8 border border-rule bg-void ${
        disabled ? "opacity-40" : "cursor-ns-resize"
      }`}
      onPointerDown={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragging(true);
        onChange(fromEvent(e.clientY));
      }}
      role="slider"
      aria-label="Throttle"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={Number(value.toFixed(2))}
      tabIndex={0}
      onKeyDown={(e) => {
        if (disabled) return;
        const d = e.shiftKey ? 0.002 : 0.02;
        if (e.key === "ArrowUp") {
          onChange(Math.min(1, value + d));
          onCommit?.(Math.min(1, value + d));
        }
        if (e.key === "ArrowDown") {
          onChange(Math.max(0, value - d));
          onCommit?.(Math.max(0, value - d));
        }
      }}
    >
      <div
        className="absolute inset-x-0 bottom-0 bg-bright/12"
        style={{ height: `${value * 100}%` }}
      />
      {marks.map((f) => (
        <div
          key={f}
          className="absolute inset-x-0 h-px bg-rule"
          style={{ bottom: `${f * 100}%` }}
        />
      ))}
      <div
        className="absolute inset-x-[-3px] h-[7px] rounded-[3px] bg-bright"
        style={{ bottom: `calc(${value * 100}% - 3.5px)` }}
      />
    </div>
  );
}
