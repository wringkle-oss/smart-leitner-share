import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Leitner Share",
  description: "Share flashcard decks with short codes."
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
