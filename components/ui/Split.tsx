"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Resizable divider. One pixel of rule, a wider invisible hit area, and no
 * animation - the handle simply is where the pointer left it.
 */
export function VDivider({
  onDrag,
  onReset,
  title,
}: {
  onDrag: (dx: number) => void;
  onReset?: () => void;
  title?: string;
}) {
  const last = useRef(0);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!active) return undefined;
    const move = (e: PointerEvent) => {
      onDrag(e.clientX - last.current);
      last.current = e.clientX;
    };
    const up = () => setActive(false);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [active, onDrag]);

  return (
    <div
      title={title ?? "Drag to resize, double-click to reset"}
      className="relative w-px shrink-0 cursor-ew-resize bg-rule"
      onPointerDown={(e) => {
        e.preventDefault();
        last.current = e.clientX;
        setActive(true);
      }}
      onDoubleClick={onReset}
    >
      <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
    </div>
  );
}

export function HDivider({ onDrag, onReset }: { onDrag: (dy: number) => void; onReset?: () => void }) {
  const last = useRef(0);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!active) return undefined;
    const move = (e: PointerEvent) => {
      onDrag(e.clientY - last.current);
      last.current = e.clientY;
    };
    const up = () => setActive(false);
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [active, onDrag]);

  return (
    <div
      title="Drag to resize, double-click to reset"
      className="relative h-px shrink-0 cursor-ns-resize bg-rule"
      onPointerDown={(e) => {
        e.preventDefault();
        last.current = e.clientY;
        setActive(true);
      }}
      onDoubleClick={onReset}
    />
  );
}

/**
 * Resizable region with its size remembered across sessions.
 *
 * The console is a workspace; having to re-drag the panels every time it loads
 * is friction with no upside. Storage is best-effort: a private window or
 * blocked site data just means the default, never a crash.
 */
export function useResizable(initial: number, min: number, max: number, key?: string) {
  const [size, setSize] = useState(initial);

  useEffect(() => {
    if (!key) return;
    try {
      const raw = window.localStorage.getItem(`act1.layout.${key}`);
      const v = raw === null ? NaN : Number.parseFloat(raw);
      if (Number.isFinite(v)) setSize(Math.min(max, Math.max(min, v)));
    } catch {
      /* storage unavailable; the default stands */
    }
  }, [key, min, max]);

  const persist = useCallback(
    (v: number) => {
      if (!key) return;
      try {
        window.localStorage.setItem(`act1.layout.${key}`, String(Math.round(v)));
      } catch {
        /* storage unavailable; the size still applies for this session */
      }
    },
    [key],
  );

  const drag = useCallback(
    (delta: number) =>
      setSize((s) => {
        const v = Math.min(max, Math.max(min, s + delta));
        persist(v);
        return v;
      }),
    [min, max, persist],
  );

  const reset = useCallback(() => {
    setSize(initial);
    persist(initial);
  }, [initial, persist]);

  return { size, drag, reset };
}

/** A one-click collapse handle sitting on a panel edge. */
export function CollapseTab({
  side,
  collapsed,
  onToggle,
  label,
}: {
  side: "left" | "right" | "bottom";
  collapsed: boolean;
  onToggle: () => void;
  label: string;
}) {
  const glyph =
    side === "bottom" ? (collapsed ? "^" : "v") : side === "left" ? (collapsed ? ">" : "<") : collapsed ? "<" : ">";
  return (
    <button
      type="button"
      onClick={onToggle}
      title={`${collapsed ? "Show" : "Hide"} ${label}`}
      className="hit num h-5 border border-rule bg-void px-1.5 text-[10px] text-dim hover:border-dim hover:text-bright"
    >
      {glyph}
    </button>
  );
}

export function Region({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex min-h-0 min-w-0 flex-col ${className}`}>{children}</div>;
}
