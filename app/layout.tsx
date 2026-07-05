import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Companion (19+)",
  description: "성인 인증 후 이용 가능한 AI 캐릭터 챗 서비스",
  robots: { index: false, follow: false },
};

// viewport-fit=cover 로 env(safe-area-inset-*) 활성화(pt-safe/pb-safe 전제).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#0d0d10",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      {/* 모바일-온리: 데스크톱에서도 중앙 좁은 컬럼(제타식). 바깥은 레터박스(검정). */}
      <body className="min-h-[100dvh] bg-black">
        <div className="relative mx-auto min-h-[100dvh] w-full max-w-[500px] bg-bg shadow-[0_0_60px_rgba(0,0,0,0.7)]">
          {children}
        </div>
      </body>
    </html>
  );
}
