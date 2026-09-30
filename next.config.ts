import type { NextConfig } from "next";

// Teammates moved to srk; old links land on analytics.
const RETIRED = ["/app/teammates", "/app/inbox", "/app/agents/:path*", "/app/agents", "/app/schedule", "/app/brains", "/app/integrations", "/app/memory", "/onboarding"];

const nextConfig: NextConfig = {
  // PGlite ships WASM + data files that must load from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite"],
  async redirects() {
    return [
      { source: "/app", destination: "/app/analytics", permanent: false },
      ...RETIRED.map((source) => ({ source, destination: "/app/analytics", permanent: false })),
    ];
  },
};

export default nextConfig;
