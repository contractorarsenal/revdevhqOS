import type { MetadataRoute } from "next";

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
    sitemap: "https://revdevhq.com/sitemap.xml",
  };
}
