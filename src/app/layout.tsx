import type { Metadata, Viewport } from "next";
import { Inter, Lilita_One } from "next/font/google";
import { themeScript } from "@/components/Theme";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// Chunky rounded display face that matches the PostGoblins wordmark.
const lilita = Lilita_One({ weight: "400", subsets: ["latin"], variable: "--font-lilita" });

// Favicon and Apple touch icon come from src/app/icon.png and apple-icon.png.
export const metadata: Metadata = {
  title: "PostGoblins",
  description: "Agentic social media scheduling",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1012" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The theme script adds the "dark" class before React hydrates.
    <html lang="en" className={`${inter.variable} ${lilita.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
