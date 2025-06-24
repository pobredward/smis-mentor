import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "react-hot-toast";
import { QueryProvider } from "@/lib/queryClient";
import AnalyticsProvider from "@/components/analytics/AnalyticsProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SMIS 멘토 채용 플랫폼",
  description: "SMIS 멘토 채용 플랫폼입니다",
  keywords: "SMIS, 멘토, 대학생, 영어캠프, 해외캠프, 국내캠프, 방학, 여름방학, 겨울방학, 아르바이트, 채용, 교육",
  authors: [{ name: '에스엠아이에스' }],
  publisher: '에스엠아이에스',
  creator: '에스엠아이에스',
  metadataBase: new URL('https://www.smis-mentor.com'),
  verification: {
    // 구글 서치 콘솔에서 발급받은 인증 코드로 교체하세요
    google: "vuF1TTsFjNoaKkVBHXKUbgNZRYcHi-S-SmAmn5kWIq0",
    other: {
      // 네이버 웹마스터 도구에서 발급받은 인증 코드로 교체하세요
      "naver-site-verification": "3f732ac5d0f0d5ccd49580ade7c5b037189b6e86",
    },
  },
  openGraph: {
    title: "SMIS 멘토 채용 플랫폼",
    description: "SMIS 멘토 채용 플랫폼입니다.",
    url: 'https://www.smis-mentor.com',
    siteName: 'SMIS 채용 플랫폼',
    images: [
      {
        url: '/logo-wide.jpg',
        width: 1200,
        height: 630,
        alt: 'SMIS 채용 플랫폼',
      }
    ],
    locale: 'ko_KR',
    type: 'website',
  },
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-icon-57x57.png', sizes: '57x57', type: 'image/png' },
      { url: '/apple-icon-60x60.png', sizes: '60x60', type: 'image/png' },
      { url: '/apple-icon-72x72.png', sizes: '72x72', type: 'image/png' },
      { url: '/apple-icon-76x76.png', sizes: '76x76', type: 'image/png' },
      { url: '/apple-icon-114x114.png', sizes: '114x114', type: 'image/png' },
      { url: '/apple-icon-120x120.png', sizes: '120x120', type: 'image/png' },
      { url: '/apple-icon-144x144.png', sizes: '144x144', type: 'image/png' },
      { url: '/apple-icon-152x152.png', sizes: '152x152', type: 'image/png' },
      { url: '/apple-icon-180x180.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      { rel: 'icon', url: '/android-icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { rel: 'manifest', url: '/manifest.json' },
    ]
  },
  appleWebApp: {
    title: 'SMIS 멘토 채용 플랫폼',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" data-theme="light" className="light">
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `
            // 사용자의 테마 설정을 무시하고 항상 라이트 테마 적용
            document.documentElement.classList.remove('dark');
            document.documentElement.classList.add('light');
            localStorage.setItem('theme', 'light');
          `
        }} />
        <meta name="msapplication-TileColor" content="#ffffff" />
        <meta name="msapplication-TileImage" content="/ms-icon-144x144.png" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "Organization",
              "name": "SMIS 멘토 채용 플랫폼",
              "url": "https://www.smis-mentor.com",
              "logo": "https://www.smis-mentor.com/logo-wide.png",
              "contactPoint": [{
                "@type": "ContactPoint",
                "telephone": "+82-10-6711-7933",
                "contactType": "customer service",
                "areaServed": "KR",
                "availableLanguage": ["Korean"]
              }],
              "address": {
                "@type": "PostalAddress",
                "streetAddress": "경기도 성남시 분당구 장미로 78, 3층 SMIS 라운지",
                "addressLocality": "성남시",
                "addressRegion": "경기도",
                "postalCode": "13558",
                "addressCountry": "KR"
              },
              "sameAs": [
                "https://www.youtube.com/@smiscamp",
                "http://pf.kakao.com/_Axafxcb/chat",
                "https://www.smisedu.com"
              ]
            },
            {
              "@context": "https://schema.org",
              "@type": "WebSite",
              "name": "SMIS 멘토 채용 플랫폼",
              "url": "https://www.smis-mentor.com",
              "potentialAction": {
                "@type": "SearchAction",
                "target": "https://www.smis-mentor.com/search?q={search_term_string}",
                "query-input": "required name=search_term_string"
              }
            }
          ])
        }} />
      </head>
      <body className={inter.className}>
        <QueryProvider>
          <AuthProvider>
            <AnalyticsProvider>
              <Toaster position="top-center" reverseOrder={false} />
              {children}
            </AnalyticsProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
