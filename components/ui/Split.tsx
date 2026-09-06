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

export function useResizable(initial: number, min: number, max: number) {
  const [size, setSize] = useState(initial);
  const drag = useCallback(
    (delta: number) => setSize((s) => Math.min(max, Math.max(min, s + delta))),
    [min, max],
  );
  const reset = useCallback(() => setSize(initial), [initial]);
  return { size, drag, reset };
}

export function Region({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex min-h-0 min-w-0 flex-col ${className}`}>{children}</div>;
}
