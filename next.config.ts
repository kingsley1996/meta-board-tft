import type { NextConfig } from 'next';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://127.0.0.1:4000';

const nextConfig: NextConfig = {
  experimental: {
    // Assistant answers can take ~45s; Next's rewrite proxy defaults to 30s.
    proxyTimeout: 90_000,
  },
  async rewrites() {
    // The API lives in a separate backend service (server/); proxy it so the
    // browser stays same-origin (cookies, no CORS).
    return [{ source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;
