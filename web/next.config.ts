import type { NextConfig } from "next";

// Where summertime-api runs. Read at build time: change it, then redeploy.
// Local development defaults to the API started by scripts/dev.sh. Hosted builds
// (netlify.toml sets SUMMERTIME_HOSTED) get no default, so /api answers "backend offline".
const hosted = Boolean(process.env.SUMMERTIME_HOSTED || process.env.NETLIFY);
const apiUrl = process.env.API_URL || (hosted ? undefined : "http://localhost:7580");

const nextConfig: NextConfig = {
  // @summertime/ledger is TypeScript source shared with the services.
  transpilePackages: ["@summertime/ledger"],
  poweredByHeader: false,
  // Privy's SDK imports optional Solana packages from its own (hoisted) location; they are
  // installed for the web workspace, so point the bundler at them. Summertime creates no
  // wallets, so these only load if a Solana feature is ever used.
  turbopack: {
    resolveAlias: Object.fromEntries(
      ["@solana/kit", "@solana-program/system", "@solana-program/token", "@solana-program/memo"].map((m) => [m, `./node_modules/${m}`]),
    ),
  },
  // The explanation pages were merged into /docs; old addresses go to the matching section.
  async redirects() {
    return [
      { source: "/how-it-works", destination: "/docs#how-it-works", permanent: false },
      { source: "/the-box", destination: "/docs#anatomy", permanent: false },
      { source: "/sailings", destination: "/docs#sailings", permanent: false },
      { source: "/canton", destination: "/docs#why-canton", permanent: false },
      { source: "/questions", destination: "/docs#questions", permanent: false },
      { source: "/privacy", destination: "/docs#trust-model", permanent: false },
    ];
  },
  async rewrites() {
    // The browser only ever talks to the web origin; the API is proxied so the session
    // cookie stays first-party. The browser never talks to the Ledger API (spec section 21).
    // Without an API_URL, app/api/[...path]/route.ts answers "backend offline" instead.
    return { beforeFiles: apiUrl ? [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }] : [], afterFiles: [], fallback: [] };
  },
};

export default nextConfig;
