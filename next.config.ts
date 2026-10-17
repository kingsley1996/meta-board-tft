import type { NextConfig } from 'next';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://127.0.0.1:4000';

const nextConfig: NextConfig = {
  async rewrites() {
    // The API lives in a separate backend service (server/); proxy it so the
    // browser stays same-origin (cookies, no CORS).
    return [{ source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;
