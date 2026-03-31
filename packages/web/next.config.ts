import { withSentryConfig } from '@sentry/nextjs';
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

export default withSentryConfig(nextConfig, {
  // Sentry 설정
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  
  // 소스맵 업로드 설정
  silent: !process.env.CI,
  widenClientFileUpload: true,
  
  // 자동 계측 설정
  autoInstrumentServerFunctions: true,
  autoInstrumentMiddleware: true,
  
  // Source maps 숨기기 (프로덕션)
  hideSourceMaps: true,
  
  // Tree shaking을 통한 번들 크기 최적화
  disableLogger: true,
});
