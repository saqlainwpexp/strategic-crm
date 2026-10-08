/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standard Next.js server: build with `npm run build`, run with `npm start` (reads $PORT).
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
