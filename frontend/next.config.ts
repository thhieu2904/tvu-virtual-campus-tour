import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/r2/:path*",
        destination: "https://tvu-tour.site/:path*",
      },
    ];
  },
};

export default nextConfig;
