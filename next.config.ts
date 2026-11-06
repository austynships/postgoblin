import type { NextConfig } from "next";

/** The public home of PostGoblins. The old Vercel address forwards here. */
const CANONICAL = "https://postgoblins.com";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        // Pages on the old address move to the new domain. API routes are left alone so
        // existing MCP clients, the cron job and in-flight logins keep working on either host.
        source: "/:path((?!api/).*)",
        has: [{ type: "host", value: "postgoblin.vercel.app" }],
        destination: `${CANONICAL}/:path`,
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
