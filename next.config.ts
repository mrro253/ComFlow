import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pdf-parse bundles pdf.js and must run as a plain Node module, not be bundled.
  serverExternalPackages: ["pdf-parse"],
  experimental: {
    // Statement PDFs are uploaded through a Server Action (default limit is 1 MB).
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
