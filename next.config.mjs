/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // 클라이언트 라우터 캐시: 동적 페이지(force-dynamic)는 캐시하지 않고 매 내비게이션마다 재요청.
    // 챗→홈 소프트 내비 시 만료된 서명URL이 재사용되던 문제 방지(항상 새 서명URL로 렌더).
    staleTimes: { dynamic: 0, static: 180 },
  },
};
export default nextConfig;
