import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  async rewrites() {
    const dest = process.env.API_INTERNAL_BASE_URL ?? 'http://localhost:3001';
    return [
      {
        source: '/admin/pos/:path*',
        destination: `${dest}/admin/pos/:path*`,
      },
    ];
  },
};

export default nextConfig;
