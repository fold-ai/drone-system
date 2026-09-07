import type { Metadata, Viewport } from "next";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./console.css";

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-inter-tight",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ACT-1 SIM",
  description:
    "Flight-performance simulation and test platform for the ACT-1 UAV. Actprove Defense Technologies, internal.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
};

/**
 * Root layout for the console.
 *
 * The second of two root layouts. Tailwind and the instrument palette are
 * imported here and nowhere else, so the marketing site never loads them and is
 * never restyled by them.
 */
export default function ConsoleRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${interTight.variable} ${jetbrainsMono.variable}`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
