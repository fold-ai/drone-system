import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ACT-1 SIM",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Console chrome.
 *
 * The instrument theme lives on this element rather than on `body`, so the
 * palette, the fixed viewport and the overflow rules apply to the console tree
 * and cannot leak into anything rendered outside it.
 */
export default function AdminProLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="console-root" data-console>
      {children}
    </div>
  );
}
