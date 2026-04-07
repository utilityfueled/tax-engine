import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Viva La Tax",
    short_name: "VLT",
    description:
      "Experimental open-source tax software. Local-first by default; verify before relying on it.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f6ef",
    theme_color: "#16191d",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
