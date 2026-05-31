import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Explicitly set the root to the current directory
  turbopack: {
    root: path.resolve("."),
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
  // Proxy /flask-api/* to the Flask API container
  // In Docker: FLASK_API_URL=http://api:8000 (baked at build time)
  // Locally:   defaults to http://localhost:8000
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
