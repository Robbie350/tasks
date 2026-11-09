import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a small self-contained server in .next/standalone for Docker.
  output: "standalone",
  experimental: {
    // Attachments are uploaded through a server action (max 25 MB + form overhead).
    serverActions: { bodySizeLimit: "26mb" },
  },
};

export default nextConfig;
