/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  distDir: 'dist',
  images: {
    unoptimized: true
  }
};

export default nextConfig;
