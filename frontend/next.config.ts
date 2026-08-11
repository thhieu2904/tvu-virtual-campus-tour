import type { NextConfig } from "next";

const mediaProxyOrigin = process.env.MEDIA_PROXY_ORIGIN ?? "https://tvu-tour.site";
const apiProxyOrigin = process.env.API_PROXY_ORIGIN ?? "https://api.tvu-tour.site";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/r2/:path*",
        destination: `${mediaProxyOrigin}/:path*`,
      },
      {
        source: "/api/:path*",
        destination: `${apiProxyOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
