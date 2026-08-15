import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for Docker: bundles a minimal server + only the
  // dependencies actually used, instead of shipping full node_modules.
  output: "standalone",
};

export default nextConfig;
