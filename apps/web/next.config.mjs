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
  }
};

export default nextConfig;
