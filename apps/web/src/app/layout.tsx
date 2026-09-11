import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";

import { ADSENSE_CLIENT, ADSENSE_ENABLED } from "@/lib/adsense";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100"),
  title: {
    default: "Coverly — 좋아하는 노래를 내 목소리로",
    template: "%s · Coverly",
  },
  description:
    "내 목소리를 만들고, 좋아하는 노래를 그 목소리로 바꿔 보세요. 설치도 설정도 필요 없습니다.",
  openGraph: {
    title: "Coverly — 좋아하는 노래를 내 목소리로",
    description: "내 목소리로 부르는 AI 커버를 만들어 보세요.",
    type: "website",
    locale: "ko_KR",
    siteName: "Coverly",
  },
  twitter: { card: "summary_large_image" },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#fbfaf8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="grain flex min-h-full flex-col">
        {/* afterInteractive: the loader must not compete with the page's own JavaScript, and a
            blocked or failed ad script must not stop the app from hydrating. */}
        {ADSENSE_ENABLED ? (
          <Script
            id="adsbygoogle"
            async
            strategy="afterInteractive"
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
          />
        ) : null}
        {/* Keyboard users should not have to tab through the whole header on every page. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
        >
          본문으로 건너뛰기
        </a>
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
