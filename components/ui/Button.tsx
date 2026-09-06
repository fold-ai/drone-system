"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "default" | "primary" | "alert" | "ghost";

const BASE =
  "hit inline-flex items-center justify-center gap-1.5 border px-2.5 h-6 text-[11px] " +
  "select-none disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap";

const VARIANTS: Record<Variant, string> = {
  default: "border-rule text-dim hover:border-dim hover:text-bright bg-void",
  primary: "border-bright text-bright bg-void hover:bg-bright hover:text-void",
  alert: "border-alert text-alert bg-void hover:bg-alert hover:text-void",
  ghost: "border-transparent text-dim hover:text-bright bg-transparent",
};

export function Button({
  variant = "default",
  active = false,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  active?: boolean;
  children: ReactNode;
}) {
  const tone = active ? "border-bright text-bright bg-void" : VARIANTS[variant];
  return (
    <button type="button" className={`${BASE} ${tone} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/** Segmented control. Used for playback speed and camera presets. */
export function Segment<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-[10px] uppercase tracking-[0.1em] text-dim">{label}</span>}
      <div className="flex border border-rule">
        {options.map((o, i) => (
          <button
            key={String(o.value)}
            type="button"
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`hit h-6 px-2 text-[11px] ${i > 0 ? "rule-l" : ""} ${
              value === o.value ? "bg-bright text-void" : "text-dim hover:text-bright"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
