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
      <body className="min-h-[100dvh]">{children}</body>
    </html>
  );
}
