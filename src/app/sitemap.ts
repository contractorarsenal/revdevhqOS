import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://revdevhq.com",
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
