import type { NextConfig } from "next";

const apiUrl = process.env.API_URL ?? "http://localhost:7580";

const nextConfig: NextConfig = {
  // @summertime/ledger is TypeScript source shared with the services.
  transpilePackages: ["@summertime/ledger"],
  poweredByHeader: false,
  async rewrites() {
    // The browser only ever talks to the web origin; the API is proxied so the session
    // cookie stays first-party. The browser never talks to the Ledger API (spec section 21).
    return [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }];
  },
};

export default nextConfig;
