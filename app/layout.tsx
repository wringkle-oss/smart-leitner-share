import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Leitner Share",
  description: "Share and study flashcard decks with short codes.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Leitner",
    statusBarStyle: "default"
  }
};

export const viewport: Viewport = {
  themeColor: "#2F7D32"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
