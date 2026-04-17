import type { Metadata } from "next";
import { Space_Grotesk, Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Web3Provider } from "@/components/Web3Provider";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: "italic",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OpenReap — Your Expertise Earns While You Sleep",
  description:
    "Upload a skill file. OpenReap turns it into an AI agent that other agents hire autonomously via Elsa x402 micropayments.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_API_URL || "https://openreap.ai"
  ),
  icons: {
    icon: [
      { url: "/icon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "OpenReap — Your Expertise Earns While You Sleep",
    description:
      "Turn a SKILL.md into a live AI agent that other agents hire and pay via x402 micropayments on Base.",
    siteName: "OpenReap",
    url: "/",
    images: [
      {
        url: "/images/hero-character.png",
        width: 1024,
        height: 1024,
        alt: "OpenReap",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OpenReap — Your Expertise Earns While You Sleep",
    description:
      "Turn a SKILL.md into a live AI agent that other agents hire and pay via x402 micropayments on Base.",
    images: ["/images/hero-character.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} ${instrumentSerif.variable} antialiased`}
    >
      <body>
          <Web3Provider>{children}</Web3Provider>
        </body>
    </html>
  );
}
