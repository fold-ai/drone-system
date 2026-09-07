"use client";

import { useEffect, useState } from "react";

const LOGO = "/brand/actprove.svg";

/**
 * The console pages, in the order they appear in the header. Adding a page here
 * is the only step needed to reach it from every other page.
 */
const PAGES = [
  { key: "console", href: "/admin-pro", label: "console",
    title: "Flight console: fly the mission and read the trajectory" },
  { key: "study", href: "/admin-pro/study", label: "airframe study",
    title: "Drag breakdown, sensitivity and parameter sweeps" },
  { key: "optimise", href: "/admin-pro/optimise", label: "optimise",
    title: "Search the design space against a declared objective" },
] as const;

export type PageKey = (typeof PAGES)[number]["key"];

/**
 * Actprove lockup: chevron mark, wide-tracked wordmark and the product name,
 * white on black. Uses the supplied SVG when it is present and falls back to
 * the mark drawn inline so the console never ships a broken image.
 */
export function Brand({
  product = "ACT-1 SIM",
  nav,
}: {
  product?: string | null;
  /** Which page is showing. The others are offered as links. */
  nav?: PageKey;
}) {
  const [hasSvg, setHasSvg] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(LOGO, { method: "HEAD" })
      .then((r) => {
        const ct = r.headers.get("content-type") ?? "";
        if (alive) setHasSvg(r.ok && ct.includes("svg"));
      })
      .catch(() => alive && setHasSvg(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <span className="flex items-center gap-3">
      {hasSvg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={LOGO} alt="Actprove Defense Technologies" className="h-4 w-auto" />
      ) : (
        <span className="flex items-center gap-2.5">
          <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden className="shrink-0">
            <path d="M7 0 L14 12 L10.6 12 L7 5.8 L3.4 12 L0 12 Z" fill="#ffffff" />
          </svg>
          <span className="tracked text-[11px] font-semibold text-bright">Actprove</span>
        </span>
      )}
      {product && (
        <span className="tracked text-[11px] font-semibold text-bright">{product}</span>
      )}
      {nav && (
        <nav className="flex items-center gap-1">
          {PAGES.filter((p) => p.key !== nav).map((p) => (
            <a
              key={p.key}
              href={p.href}
              title={p.title}
              className="hit border border-rule px-1.5 py-0.5 text-[10px] text-dim hover:border-dim hover:text-bright"
            >
              {p.label}
            </a>
          ))}
        </nav>
      )}
    </span>
  );
}
