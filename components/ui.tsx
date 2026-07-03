// 공용 UI 헬퍼: 로고, 그라데이션 아바타(플레이스홀더), 카운트 포맷, 결정론적 목업 통계.
// ⚠️ 통계·이미지 수는 실제 성인 콘텐츠가 아닌 표시용 플레이스홀더다(ui-ux 규칙).

export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={"flex items-center gap-1.5 " + className}>
      <span className="text-xl font-extrabold tracking-tight text-white">TOPTOON</span>
      <span className="rounded bg-danger px-1 py-0.5 text-[10px] font-extrabold leading-none text-white">
        CHAT
      </span>
    </div>
  );
}

// 이름 기반 결정론적 그라데이션 (대표 이미지 파이프라인 전 플레이스홀더).
export function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `linear-gradient(150deg, hsl(${h} 42% 30%), hsl(${(h + 45) % 360} 48% 18%))`;
}

export function Avatar({
  name,
  size = 40,
  rounded = "rounded-full",
}: {
  name: string;
  size?: number;
  rounded?: string;
}) {
  return (
    <div
      className={"flex shrink-0 items-center justify-center font-bold text-white/85 " + rounded}
      style={{ width: size, height: size, background: gradientFor(name), fontSize: size * 0.42 }}
      aria-hidden
    >
      {name.slice(0, 1)}
    </div>
  );
}

// TopToon식 카운트 표기: 12000 → "1.2만", 2600 → "2.6천".
export function formatCount(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "만";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "천";
  return String(n);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

// 카드/프로필용 표시 플레이스홀더 통계(결정론적). 실데이터 아님.
export function mockStats(id: string) {
  const h = hash(id);
  return {
    views: 20000 + (h % 280000),
    comments: 1000 + ((h >> 3) % 19000),
    likes: 100 + ((h >> 5) % 400),
    bedroom: 20 + ((h >> 7) % 90),
    living: 10 + ((h >> 9) % 50),
    rankScore: 50 + ((h >> 2) % 300),
    isNew: h % 3 === 0,
  };
}
