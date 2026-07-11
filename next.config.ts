import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep bookmarked/external /goals links working — the real page is /goaly.
  async redirects() {
    return [
      { source: '/goals', destination: '/goaly', permanent: true },
      { source: '/goals/:path*', destination: '/goaly', permanent: true },
    ]
  },
};

export default nextConfig;
