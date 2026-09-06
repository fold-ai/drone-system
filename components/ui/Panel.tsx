"use client";

import type { ReactNode } from "react";

/**
 * A region of the console. Panels are separated by 1px rules, never by shadows
 * or gaps, and only top-level region headers use the wide tracking that echoes
 * the wordmark.
 */
export function Panel({
  title,
  right,
  children,
  className = "",
  bodyClassName = "",
  scroll = false,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  scroll?: boolean;
}) {
  return (
    <section className={`flex min-h-0 min-w-0 flex-col bg-panel ${className}`}>
      {title !== undefined && (
        <header className="flex h-7 shrink-0 items-center justify-between gap-2 rule-b px-3">
          <h2 className="tracked text-[10px] text-dim">{title}</h2>
          {right}
        </header>
      )}
      <div
        className={`min-h-0 flex-1 ${scroll ? "overflow-y-auto overflow-x-hidden" : "overflow-hidden"} ${bodyClassName}`}
      >
        {children}
      </div>
    </section>
  );
}

export function SubHead({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-1">
      <h3 className="text-[10px] uppercase tracking-[0.1em] text-dim">{children}</h3>
      {right}
    </div>
  );
}

export function Divider() {
  return <div className="rule-b" />;
}
