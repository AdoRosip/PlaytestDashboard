import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Browser fixtures can run alongside the developer's existing server.
  distDir: process.env.PLAYWRIGHT_TEST_DIST_DIR || '.next',
};

export default nextConfig;
