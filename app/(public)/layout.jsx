import { Archivo, IBM_Plex_Sans } from "next/font/google";
import "./site.css";

const display = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  variable: "--font-display"
});

const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
  variable: "--font-body"
});

export const metadata = {
  metadataBase: new URL("https://actprove.com"),
  title: "Actprove Defense Technologies",
  description:
    "Actprove Defense Technologies builds high-speed unmanned aircraft and the onboard intelligence that flies them. ACT-1 is in beta flight testing.",
  openGraph: {
    title: "Actprove Defense Technologies",
    description:
      "High-speed unmanned aircraft and the intelligence that flies them.",
    type: "website"
  }
};

export const viewport = {
  themeColor: "#000000"
};

/**
 * Root layout for the public site.
 *
 * One of two root layouts. The console has its own under app/(console), with
 * its own fonts and its own stylesheet, so neither design system reaches the
 * other: the App Router only ships the CSS a route's own tree imports.
 */
export default function PublicRootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
