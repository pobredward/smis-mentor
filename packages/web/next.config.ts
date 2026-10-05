import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Monorepo 환경을 위한 설정
  transpilePackages: ['@smis-mentor/shared'],

  // TypeScript 빌드 설정 (타입 오류 해결 후 제거 예정)
  typescript: {
    ignoreBuildErrors: true,
  },

  // www.smiscamp.com → smiscamp.com 영구 리디렉션 (postMessage origin 불일치 · Firebase CORS 문제 방지)
  // 옛 주소 smis-mentor.com · www 도 전환 뒤 이 프로젝트에 붙이면 같은 경로의 smiscamp.com 으로 보낸다
  async redirects() {
    return ['www.smiscamp.com', 'smis-mentor.com', 'www.smis-mentor.com'].map((host) => ({
      source: '/:path*',
      has: [{ type: 'host' as const, value: host }],
      destination: 'https://smiscamp.com/:path*',
      permanent: true,
    }));
  },

  // AI 에이전트용 마크다운 미러: 어떤 페이지든 URL 뒤에 .md 를 붙이면 마크다운으로 제공
  //   /job-board.md → /api/md/job-board, /index.md → 홈  (구현: src/app/api/md/[[...path]]/route.ts)
  async rewrites() {
    return [
      {
        source: '/:path*.md',
        destination: '/api/md/:path*',
      },
    ];
  },

  // 외부 iframe 콘텐츠 허용을 위한 헤더 설정
  async headers() {
    return [
      {
        // iOS 유니버설 링크 — 확장자 없는 파일이라 JSON 으로 알려 준다 (Apple 은 리디렉션 없이 이 주소를 읽는다)
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
      {
        // Android 앱 링크 인증을 위한 Digital Asset Links 파일 설정
        source: '/.well-known/assetlinks.json',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/json',
          },
        ],
      },
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            // Firebase Google OAuth 팝업: accounts.google.com, <프로젝트>.firebaseapp.com 필수
            value: "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com https://*.notion.site https://*.notion.so https://docs.google.com https://www.google.com https://postcode.map.kakao.com http://postcode.map.kakao.com https://*.daumcdn.net http://*.daumcdn.net;",
          },
          {
            // Firebase 소셜 로그인 팝업(Google 등)이 부모 창과 통신하기 위해 unsafe-none 필요
            key: 'Cross-Origin-Opener-Policy',
            value: 'unsafe-none',
          },
        ],
      },
    ];
  },

};

export default withSentryConfig(nextConfig, {
  // Sentry 설정 - 환경변수 또는 기본값 사용
  org: process.env.SENTRY_ORG || "pobredward",
  project: process.env.SENTRY_PROJECT || "smiscamp-web",

  // CI에서만 로그 출력
  silent: !process.env.CI,

  // 소스맵 업로드 설정
  widenClientFileUpload: true,

  // 브라우저 요청을 Sentry로 라우팅하여 광고 차단기 우회
  tunnelRoute: "/monitoring",

  // 모노레포 환경에서 Vercel 빌드 시 path 에러 방지 (basePath undefined 문제)
  routeManifestInjection: false,
});
