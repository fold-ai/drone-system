import Deck from "./Deck";
import "./deck.css";

/**
 * The deck is meant to be sent as a link, not found by search. It stays out of
 * the sitemap and asks crawlers to leave it alone; anyone with the URL can read it.
 */
export const metadata = {
  title: "Actprove, pitch deck",
  description: "ACT-1 and PROVE-1, in thirteen slides.",
  robots: { index: false, follow: false }
};

export default function PitchDeckPage() {
  return <Deck />;
}
