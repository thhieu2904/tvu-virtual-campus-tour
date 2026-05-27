import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/r2/:path*",
        destination: "https://tvu-tour.site/:path*",
      },
      {
        source: "/api/:path*",
        destination: "http://152.42.226.201:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
