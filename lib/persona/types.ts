// 페르소나 캐논 스키마 (단일 진실원천의 타입 계약).
// MCP 서버와 chat 라우트가 동일하게 이 타입을 사용한다.

export interface PersonaIdentity {
  name: string;
  age: number; // 반드시 >= 18 (assertAdultCanon이 강제)
  backstory?: string;
  relationships?: string;
}

export interface PersonaVoice {
  register: string; // 말투/어조 (예: "다정한 존댓말·반말 혼용")
  tics?: string[]; // 반복 어투/버릇
  language?: string; // 기본 언어 (예: "ko")
}

export interface PersonaCanon {
  identity: PersonaIdentity;
  voice: PersonaVoice;
  appearance: string; // 이미지 프롬프트 베이스
  boundaries: string[]; // in-character 경계(안전 가드의 추가 방어)
  canon_facts: string[]; // 봇이 모순하면 안 되는 불변 사실
}

export interface CharacterMemory {
  kind: "fact" | "relationship" | "preference";
  content: string;
}

// 세션에 고정되는 시나리오 스냅샷(스토리라인).
export interface ScenarioSnapshot {
  title: string;
  scenario: string; // 세계관/상황 — 시스템 프롬프트에 주입
  greeting: string; // 첫 인사 — 오프닝 봇 메시지로 시드
}

// check_consistency 결과.
export type ConsistencyViolationType =
  | "age_or_minor" // 안전 카테고리 — 하드(모더레이션이 최종 권한)
  | "identity_contradiction" // 이름/나이 등 캐논 정체성 모순
  | "canon_contradiction" // 불변 사실 모순
  | "out_of_voice"; // 말투/언어 이탈

export interface ConsistencyViolation {
  type: ConsistencyViolationType;
  detail: string;
  hard: boolean; // true면 재생성으로도 통과 불가(안전) → 차단
}

export interface ConsistencyResult {
  ok: boolean;
  violations: ConsistencyViolation[];
}
