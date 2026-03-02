import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Monorepo 환경을 위한 설정
  transpilePackages: ['@smis-mentor/shared'],
  
  async redirects() {
    return [
      {
        source: '/',
        destination: '/',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
