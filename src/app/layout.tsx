import type { Metadata } from "next";
import { Inter, Lilita_One } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// Chunky rounded display face that matches the PostGoblins wordmark.
const lilita = Lilita_One({ weight: "400", subsets: ["latin"], variable: "--font-lilita" });

// Favicon and Apple touch icon come from src/app/icon.png and apple-icon.png.
export const metadata: Metadata = {
  title: "PostGoblins",
  description: "Agentic social media scheduling",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${lilita.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
