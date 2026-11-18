import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "::1", "[::1]"],
  experimental: {
    agentUpgrade: "security",
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
