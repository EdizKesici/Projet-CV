import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: path.resolve("."),
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async rewrites() {
    const flaskUrl = process.env.FLASK_API_URL || 'http://localhost:8000';
    return [
      {
        source: '/flask-api/:path*',
        destination: `${flaskUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
