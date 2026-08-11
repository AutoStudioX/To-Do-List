import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep bookmarked/external /goals links working — the real page is /goaly.
  async redirects() {
    return [
      { source: '/goals', destination: '/goaly', permanent: true },
      { source: '/goals/:path*', destination: '/goaly', permanent: true },
      // Sekce se přejmenovala z /navyky na /habits — záložky ať fungují dál.
      { source: '/navyky', destination: '/habits', permanent: true },
      { source: '/navyky/:path*', destination: '/habits/:path*', permanent: true },
    ]
  },
};

export default nextConfig;
