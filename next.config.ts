import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // Legacy client-portal URLs keep working: every old /portal route (and any
  // emailed invite link) redirects to its /clientportal replacement. Query
  // strings (e.g. ?token=) are preserved by Next's redirect handling.
  async redirects() {
    return [
      { source: "/portal", destination: "/clientportal", permanent: false },
      { source: "/portal/leads", destination: "/clientportal/leads", permanent: false },
      { source: "/portal/requests", destination: "/clientportal/requests", permanent: false },
      { source: "/portal/accept-invite", destination: "/clientportal/accept-invite", permanent: false },
      { source: "/portal/access-denied", destination: "/clientportal/access-denied", permanent: false },
    ];
  },
};

export default nextConfig;
