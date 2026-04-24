import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** @type {import("next").NextConfig} */
const nextConfig = {
  typedRoutes: true,
  outputFileTracingRoot: rootDir,
  images: {
    unoptimized: true
  }
};

export default nextConfig;
