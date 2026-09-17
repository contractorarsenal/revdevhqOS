import type { MetadataRoute } from "next";
import { env } from "@/lib/env/server";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Authenticated application routes — nothing indexable behind these.
        disallow: [
          "/dashboard",
          "/clients",
          "/leads",
          "/pipeline",
          "/projects",
          "/tasks",
          "/calendar",
          "/billing",
          "/expenses",
          "/reports",
          "/settings",
          "/setup",
          "/onboarding",
          "/auth",
        ],
      },
    ],
    sitemap: `${env.NEXT_PUBLIC_APP_URL}/sitemap.xml`,
  };
}
