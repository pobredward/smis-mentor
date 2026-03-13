import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Monorepo 환경을 위한 설정
  transpilePackages: ['@smis-mentor/shared'],
  
  // 외부 iframe 콘텐츠 허용을 위한 헤더 설정
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-src 'self' https://*.notion.site https://*.notion.so https://docs.google.com https://www.google.com;",
          },
        ],
      },
    ];
  },
  
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
