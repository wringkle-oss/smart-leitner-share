import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Smart Leitner Web",
    short_name: "Leitner",
    description: "Study shared Smart Leitner flashcard decks in the browser.",
    start_url: "/study",
    display: "standalone",
    background_color: "#DDF3FF",
    theme_color: "#2F7D32",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml"
      }
    ]
  };
}
