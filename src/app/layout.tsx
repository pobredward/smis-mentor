import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "react-hot-toast";
import { QueryProvider } from "@/lib/queryClient";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SMIS 멘토 채용 플랫폼",
  description: "에스엠아이에스(SMIS) 공식 채용 플랫폼입니다. 멘토 채용 및 교육 정보를 제공합니다.",
  keywords: "SMIS, 에스엠아이에스, 멘토, 채용, 교육, 플랫폼, 임대환, 성남시, 분당구",
  authors: [{ name: '에스엠아이에스' }],
  publisher: '에스엠아이에스',
  creator: '에스엠아이에스',
  metadataBase: new URL('https://www.smis-mentor.com'),
  verification: {
    // 구글 서치 콘솔에서 발급받은 인증 코드로 교체하세요
    google: "구글_사이트_인증코드",
    other: {
      // 네이버 웹마스터 도구에서 발급받은 인증 코드로 교체하세요
      "naver-site-verification": "네이버_사이트_인증코드",
    },
  },
  openGraph: {
    title: "SMIS - 에스엠아이에스 공식 채용 플랫폼",
    description: "에스엠아이에스(SMIS) 공식 채용 플랫폼입니다. 멘토 채용 및 교육 정보를 제공합니다.",
    url: 'https://www.smis-mentor.com',
    siteName: 'SMIS 채용 플랫폼',
    images: [
      {
        url: '/og-image.jpg',
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
  themeColor: '#ffffff',
  appleWebApp: {
    title: 'SMIS 채용 플랫폼',
    statusBarStyle: 'default',
  },
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
      </head>
      <body className={inter.className}>
        <QueryProvider>
          <AuthProvider>
            <Toaster position="top-center" reverseOrder={false} />
            {children}
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
