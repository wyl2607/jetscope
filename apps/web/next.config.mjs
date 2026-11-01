import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** @type {import("next").NextConfig} */
const nextConfig = {
  // The container runs `node server.js` out of `.next/standalone`, which carries
  // its own traced `node_modules`. Without this the runtime image would need the
  // whole workspace install. `outputFileTracingRoot` below is what makes the
  // trace reach across the workspace root.
  output: 'standalone',
  // oci-a1 and usa build separately; the same commit must produce the same
  // buildId so /_next/static assets still match after a failover. Returning
  // null falls back to Next's default random id when the SHA is not set.
  generateBuildId: async () => process.env.JETSCOPE_BUILD_SHA || null,
  typedRoutes: true,
  outputFileTracingRoot: rootDir,
  // Inlined at build time: the systemd unit starts the server without it.
  env: {
    JETSCOPE_BUILD_SHA: process.env.JETSCOPE_BUILD_SHA || 'unknown'
  },
  images: {
    unoptimized: true
  },
  // Admin is an operational surface. Keep it out of search indexes even when
  // a request reaches Next without the nginx admin location in front.
  async headers() {
    const noIndex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];
    return [
      { source: '/admin', headers: noIndex },
      { source: '/admin/:path*', headers: noIndex },
      { source: '/de/admin', headers: noIndex },
      { source: '/de/admin/:path*', headers: noIndex },
      { source: '/en/admin', headers: noIndex },
      { source: '/en/admin/:path*', headers: noIndex }
    ];
  }
};

export default nextConfig;
