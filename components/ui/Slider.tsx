"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fixed } from "@/lib/format";

/**
 * Labelled slider with a numeric field and a reset to the model default.
 *
 * Dragging fires `onInput` continuously so derived readouts track the handle,
 * and `onCommit` once on release for anything that costs a round trip.
 */
export function Slider({
  label,
  unit,
  value,
  min,
  max,
  step = 0.01,
  decimals,
  defaultValue,
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
  onInput: (v: number) => void;
  onCommit?: (v: number) => void;
  onReset?: () => void;
  disabled?: boolean;
  alert?: boolean;
  title?: string;
}) {
  const dp = decimals ?? Math.max(0, Math.ceil(-Math.log10(step || 0.01)));
  const [text, setText] = useState<string | null>(null);
  const modified = defaultValue !== undefined && Math.abs(value - defaultValue) > step / 2;

  const commitText = useCallback(() => {
    if (text === null) return;
    const v = Number.parseFloat(text);
    setText(null);
    if (Number.isFinite(v)) {
      const clamped = Math.min(max, Math.max(min, v));
      onInput(clamped);
      onCommit?.(clamped);
    }
  }, [text, min, max, onInput, onCommit]);

  return (
    <div className="px-3 py-1.5" title={title}>
      <div className="flex items-baseline justify-between gap-2">
        <label className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-[11px] text-dim">{label}</span>
          {modified && onReset && (
            <button
              type="button"
              onClick={onReset}
              title={`Reset to ${fixed(defaultValue, dp)}`}
              className="hit shrink-0 text-[9px] text-dim hover:text-bright"
            >
              [reset]
            </button>
          )}
        </label>
        <span className="flex shrink-0 items-baseline gap-1">
          <input
            className={`num w-[74px] text-right text-[12px] ${alert ? "text-alert" : ""}`}
            value={text ?? fixed(value, dp)}
            disabled={disabled}
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
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onInput(Number.parseFloat(e.target.value))}
        onPointerUp={(e) => onCommit?.(Number.parseFloat((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onCommit?.(Number.parseFloat((e.target as HTMLInputElement).value))}
      />
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  title,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  title?: string;
}) {
  return (
    <label
      className="hit flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-[11px] text-dim hover:text-bright"
      title={title}
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
        const d = e.shiftKey ? 0.1 : 0.02;
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
      {[0.25, 0.5, 0.75].map((f) => (
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
