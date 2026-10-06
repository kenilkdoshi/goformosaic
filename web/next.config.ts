import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Lets `npm start -- --lan` in local/ serve the dev site to a phone on the same network.
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS ? process.env.ALLOWED_DEV_ORIGINS.split(",") : [],
  serverExternalPackages: ["sharp", "archiver"],
  // The watermark PNG is read from disk at runtime, so make sure it ships with the standalone build.
  outputFileTracingIncludes: {
    "/admin/**": ["./assets/**"],
    "/api/admin/**": ["./assets/**"],
  },
  experimental: {
    serverActions: { bodySizeLimit: "1mb" },
  },
};

export default nextConfig;
