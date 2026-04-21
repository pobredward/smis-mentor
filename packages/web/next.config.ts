import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Monorepo 환경을 위한 설정
  transpilePackages: ['@smis-mentor/shared'],
  
  // TypeScript 빌드 설정
  typescript: {
    // 주의: 타입 오류를 무시하고 빌드를 진행합니다.
    // 실제 문제가 해결되면 제거하는 것이 좋습니다.
    ignoreBuildErrors: true,
  },
  
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
  // Sentry 설정 - 환경변수 또는 기본값 사용
  org: process.env.SENTRY_ORG || "pobredward",
  project: process.env.SENTRY_PROJECT || "smis-mentor-web",
  
  // CI에서만 로그 출력
  silent: !process.env.CI,
  
  // 소스맵 업로드 설정
  widenClientFileUpload: true,
  
  // 브라우저 요청을 Sentry로 라우팅하여 광고 차단기 우회
  tunnelRoute: "/monitoring",
  
  // webpack 설정
  webpack: {
    // Vercel Cron Monitors 자동 계측 활성화
    automaticVercelMonitors: true,
    
    // 번들 크기 축소를 위한 Tree-shaking 옵션
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
