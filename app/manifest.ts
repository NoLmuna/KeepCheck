import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KeepCheck",
    short_name: "KeepCheck",
    description:
      "Log and rate your experiences at food and beverage businesses.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#000000",
    icons: [
      {
        src: "/KeepCheck-Logo.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/KeepCheck-Logo.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
