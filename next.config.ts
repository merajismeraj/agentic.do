import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships WASM + data files that must load from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Agent analytics is the main product; Teammates lives at /app/teammates.
  async redirects() {
    return [{ source: "/app", destination: "/app/analytics", permanent: false }];
  },
};

export default nextConfig;
