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
  typedRoutes: true,
  outputFileTracingRoot: rootDir,
  images: {
    unoptimized: true
  },
  // Admin is an operational surface. Keep it out of search indexes regardless
  // of which edge (host nginx today, container nginx after P4) sits in front.
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
