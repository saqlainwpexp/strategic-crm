/** @type {import('next').NextConfig} */

const securityHeaders = [
  // Don't let other sites embed the CRM (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // Browsers only honour this over HTTPS (i.e. on the live site).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig = {
  // Standard Next.js server: build with `npm run build`, run with `npm start` (reads $PORT).
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  // The app doesn't use next/image; disabling the optimiser removes that attack surface.
  images: { unoptimized: true },
  // Mail libraries use Node APIs; load them as-is on the server instead of bundling.
  serverExternalPackages: ["nodemailer", "imapflow", "mailparser"],
  experimental: {
    // CSV imports of a few thousand leads go through a server action.
    serverActions: { bodySizeLimit: "4mb" },
    // Hostinger shared hosting caps processes per account; parallel build workers hit
    // "spawn EAGAIN" during page-data collection. Build with one worker.
    cpus: 1,
    workerThreads: false,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
