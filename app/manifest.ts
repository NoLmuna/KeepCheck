import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KeepCheck",
    short_name: "KeepCheck",
    description:
      "Log and rate your experiences at food and beverage businesses.",
    start_url: "/",
    display: "standalone",
    shortcuts: [
      { name: "Quick Log Spot", url: "/#action=log", description: "Log a new visit offline" },
      { name: "Nearby Wishlist", url: "/map#status=wishlist", description: "Explore your nearby wishlist" },
    ],
    background_color: "#F8F1E7",
    theme_color: "#4E342E",
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
