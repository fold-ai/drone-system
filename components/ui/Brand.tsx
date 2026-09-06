"use client";

import { useEffect, useState } from "react";

const LOGO = "/brand/actprove.svg";

/**
 * Actprove lockup: chevron mark, wide-tracked wordmark and the product name,
 * white on black. Uses the supplied SVG when it is present and falls back to
 * the mark drawn inline so the console never ships a broken image.
 */
export function Brand({ product = "ACT-1 SIM" }: { product?: string | null }) {
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
    </span>
  );
}
