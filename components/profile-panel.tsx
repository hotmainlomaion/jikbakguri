// 캐릭터 프로필 본문 — 데스크톱 aside(ProfilePanel)와 모바일 바텀시트가 공유.
// ⚠️ 실제 성인 이미지 없음: gradientFor 그라데이션 + 이니셜 플레이스홀더만(안전규칙).
import { Avatar, gradientFor, formatCount } from "./ui";
import { IcEye, IcChatBubble, IcHeart, IcPin, IcImage, IcShare } from "./icons";

export type ProfileBot = {
  name: string;
  quote: string;
  tags: string[];
  characterAge: number;
  views: number;
  comments: number;
  likes: number;
  bedroom: number;
  living: number;
  avatarUrl?: string | null;
};

// imageUrl 있으면 실제 대표컷, 없으면 gradientFor 폴백(회귀 0).
export function ProfileImage({
  name,
  className = "",
  imageUrl,
}: {
  name: string;
  className?: string;
  imageUrl?: string | null;
}) {
  return (
    <div className={"relative overflow-hidden " + className} style={{ background: gradientFor(name) }}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={name} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-[96px] font-black text-white/12">
          {name.slice(0, 1)}
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-bg2 to-transparent" />
    </div>
  );
}

export function ProfileDetails({ bot, onReport }: { bot: ProfileBot; onReport: () => void }) {
  return (
    <>
      <div className="mt-3 flex items-center gap-2">
        <Avatar name={bot.name} size={34} />
        <h2 className="text-lg font-bold text-text">{bot.name}</h2>
      </div>
      <p className="mt-2 text-sm text-muted">“{bot.quote}”</p>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {bot.tags.map((t) => (
          <span key={t} className="tag">
            #{t}
          </span>
        ))}
        <span className="tag">#성인{bot.characterAge}</span>
      </div>

      <div className="mt-4 flex items-center gap-4 text-sm text-muted">
        <span className="flex items-center gap-1">
          <IcEye className="h-4 w-4" /> {bot.views.toLocaleString()}회
        </span>
        <span className="flex items-center gap-1">
          <IcChatBubble className="h-4 w-4" /> {formatCount(bot.comments)}회
        </span>
        <span className="flex items-center gap-1">
          <IcHeart className="h-4 w-4" /> {bot.likes}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          <IcPin className="h-4 w-4 text-primary" /> 침실 <b className="ml-auto text-text">{bot.bedroom}장</b>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          <IcPin className="h-4 w-4 text-primary" /> 거실 <b className="ml-auto text-text">{bot.living}장</b>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button className="btn-ghost flex-1">
          <IcImage className="h-4 w-4" /> 시크릿 컬렉션
        </button>
        <button className="btn-ghost !px-3">
          <IcHeart className="h-4 w-4" />
        </button>
        <button className="btn-ghost !px-3">
          <IcShare className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5">
        <p className="mb-1 flex items-center gap-1 text-sm font-semibold text-primary">❝ 코멘트</p>
        <p className="text-[13px] leading-relaxed text-muted">{bot.quote}</p>
      </div>

      {/* 신고는 컴플라이언스 필수 — 모바일 시트에서도 반드시 도달 가능 */}
      <button onClick={onReport} className="mt-5 text-xs text-subtle hover:text-danger">
        🚩 신고하기
      </button>
    </>
  );
}
