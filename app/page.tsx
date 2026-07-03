// S1. 랜딩 — 19금 표시 명확, 콘텐츠 미리보기 노출 금지(ui-ux 규칙).
import Link from "next/link";

export default function Landing() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col items-center justify-center px-4 text-center sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <span className="badge-19">19</span>
        <span className="text-sm text-muted">성인 전용 서비스</span>
      </div>
      <h1 className="text-2xl font-semibold sm:text-3xl lg:text-4xl">AI Companion</h1>
      <p className="mt-4 max-w-md text-muted">
        운영자가 큐레이션한 AI 캐릭터와 텍스트로 대화하고 이미지를 생성하는
        성인향(18+) 서비스입니다. 이용하려면 본인확인 기반 성인 인증이 필요합니다.
      </p>

      <div className="mt-8 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:gap-3">
        <Link href="/login" className="btn-primary w-full text-center sm:w-auto">
          성인 인증 후 이용하기
        </Link>
      </div>

      <ul className="mt-10 space-y-1 text-xs text-muted">
        <li>· 만 19세 미만은 이용할 수 없습니다.</li>
        <li>· 미성년·불법 콘텐츠 생성은 입력·출력 단계에서 차단됩니다.</li>
        <li>· 문제 콘텐츠는 신고할 수 있습니다.</li>
      </ul>

      <footer className="mt-12 text-xs text-muted">
        {/* TODO(운영주체 확인): 이용약관 / 개인정보처리방침 링크 */}
        이용약관 · 개인정보처리방침 · 청소년보호정책
      </footer>
    </main>
  );
}
