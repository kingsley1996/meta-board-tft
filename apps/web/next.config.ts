import type { NextConfig } from 'next';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://127.0.0.1:4000';

const nextConfig: NextConfig = {
  // Dev tools hit the server via 127.0.0.1 while it listens on localhost;
  // without this Next blocks the HMR websocket as cross-origin.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  experimental: {
    // Assistant answers can take ~45s; Next's rewrite proxy defaults to 30s.
    proxyTimeout: 90_000,
  },
  transpilePackages: ['@metaboard/shared'],
  async rewrites() {
    // Keep browser requests same-origin while the API runs as a separate service.
    return [{ source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;
