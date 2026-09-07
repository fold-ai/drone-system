import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Not found",
  robots: { index: false, follow: false },
};

/**
 * The 404 lives in the public group so it inherits a root layout; with two root
 * layouts neither one owns the top level on its own. A stranger who guesses a
 * URL therefore lands on public chrome, and nothing here hints that a console
 * exists.
 */
export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "70vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 13, letterSpacing: "0.18em", opacity: 0.6, margin: 0 }}>404</p>
        <h1 style={{ fontSize: 20, fontWeight: 400, margin: "0.75rem 0 1.25rem" }}>
          That page does not exist.
        </h1>
        <a href="/" style={{ fontSize: 14 }}>
          Actprove Defense Technologies
        </a>
      </div>
    </main>
  );
}
