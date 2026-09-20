import type { MetadataRoute } from "next";
import { env } from "@/lib/env/server";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: env.NEXT_PUBLIC_APP_URL,
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
