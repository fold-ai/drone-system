import { notFound } from "next/navigation";

/**
 * Catch-all so unmatched URLs render the public 404 rather than the framework
 * default. With two root layouts Next has no root-level not-found to fall back
 * on, so the public group claims the leftovers.
 *
 * It sits behind every real route, including /admin-pro, and behind the
 * beforeFiles rewrite that proxies /api to the Python solver in development.
 * An unknown path under /admin-pro therefore shows the same public 404 as any
 * other bad URL, which is the right answer: it confirms nothing.
 */
export default function CatchAll() {
  notFound();
}
