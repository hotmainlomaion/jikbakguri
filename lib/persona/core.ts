// ============================================================
// lib/persona/core.ts — 페르소나 일관성 단일 진실원천(SSOT).
// chat 라우트가 직접 import 하고, mcp/persona-server.ts 가 동일 코어를 MCP로 노출한다.
// 한 코어, 두 진입점.
//
// 안전 정렬(CLAUDE.md 7-B): 이 모듈은 moderation을 대체하지 않는다.
//  - 불법 카테고리 판정 권한은 여전히 lib/moderation.
//  - assertAdultCanon / age_or_minor 체크는 "추가 방어"이지 우회가 아니다.
// ============================================================
import { createAdminClient } from "@/lib/supabase/admin";
import { heuristicScan } from "@/lib/moderation/categories";
import type {
  PersonaCanon,
  CharacterMemory,
  ConsistencyResult,
  ConsistencyViolation,
  ScenarioSnapshot,
} from "./types";

// ---------- 캐논 안전 검증 (18+ 강제) ----------
export function assertAdultCanon(canon: PersonaCanon): void {
  const age = canon?.identity?.age;
  if (typeof age !== "number" || age < 18) {
    throw new Error("persona canon rejected: identity.age must be >= 18");
  }
}

// ---------- 세션 스냅샷 확보 ----------
// 세션에 고정된 캐논을 반환. 없으면(구세션) 현재 봇 캐논을 스냅샷해 채운다.
// 스냅샷 덕분에 운영자가 프로필을 수정해도 진행 중 세션은 흔들리지 않는다.
export async function getSessionCanon(sessionId: string): Promise<{
  canon: PersonaCanon;
  scenario: ScenarioSnapshot | null;
  personaVersion: number;
} | null> {
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("sessions")
    .select("id, bot_profile_id, persona_snapshot, persona_version, scenario_snapshot")
    .eq("id", sessionId)
    .single();
  if (!session) return null;

  const scenario = (session.scenario_snapshot as ScenarioSnapshot | null) ?? null;

  if (session.persona_snapshot) {
    const canon = session.persona_snapshot as PersonaCanon;
    assertAdultCanon(canon);
    return { canon, scenario, personaVersion: session.persona_version ?? 1 };
  }

  // 스냅샷 없음 → 현재 캐논으로 지연 스냅샷.
  const { data: bot } = await admin
    .from("bot_profiles")
    .select("canon, persona_version")
    .eq("id", session.bot_profile_id)
    .single();
  if (!bot?.canon) return null;
  const canon = bot.canon as PersonaCanon;
  assertAdultCanon(canon);
  await admin
    .from("sessions")
    .update({ persona_snapshot: canon, persona_version: bot.persona_version })
    .eq("id", sessionId);
  return { canon, scenario, personaVersion: bot.persona_version };
}

// 세션 생성 시 호출: 현재 봇 캐논(+선택 시나리오)을 스냅샷으로 고정.
// 반환: 오프닝 봇 메시지로 시드할 greeting(있으면).
export async function pinPersonaSnapshot(
  sessionId: string,
  botProfileId: string,
  scenarioId?: string | null
): Promise<{ greeting: string | null }> {
  const admin = createAdminClient();
  const { data: bot } = await admin
    .from("bot_profiles")
    .select("canon, persona_version")
    .eq("id", botProfileId)
    .single();
  if (!bot?.canon) return { greeting: null };
  const canon = bot.canon as PersonaCanon;
  assertAdultCanon(canon); // 미성년 캐논은 세션 시작 자체를 거부

  let scenarioSnapshot: ScenarioSnapshot | null = null;
  if (scenarioId) {
    // published + 해당 봇 소속 시나리오만 채택.
    const { data: sc } = await admin
      .from("scenarios")
      .select("title, scenario, greeting")
      .eq("id", scenarioId)
      .eq("bot_profile_id", botProfileId)
      .eq("is_published", true)
      .single();
    if (sc) scenarioSnapshot = sc as ScenarioSnapshot;
  }

  await admin
    .from("sessions")
    .update({
      persona_snapshot: canon,
      persona_version: bot.persona_version,
      scenario_id: scenarioId ?? null,
      scenario_snapshot: scenarioSnapshot,
    })
    .eq("id", sessionId);

  return { greeting: scenarioSnapshot?.greeting ?? null };
}

// ---------- 시스템 프롬프트 합성 ----------
// 캐논(고정) + 최근 기억을 결정론적으로 조립. ad-hoc 문자열 concat 금지 — 여기서 단일화.
function composeSystemPrompt(
  canon: PersonaCanon,
  memory: CharacterMemory[],
  scenario?: ScenarioSnapshot | null
): string {
  const id = canon.identity;
  const lines: string[] = [];
  lines.push(
    `You are ${id.name}, an adult character (age ${id.age}). You are an adult (18+) character and must never portray, imply, or roleplay as a minor.`
  );
  if (id.backstory) lines.push(`Backstory: ${id.backstory}`);
  if (id.relationships) lines.push(`Relationships: ${id.relationships}`);
  if (scenario) {
    lines.push(`Current scenario — "${scenario.title}": ${scenario.scenario}`);
    lines.push(`Stay within this scenario's setting and situation.`);
  }
  lines.push(
    `Voice: ${canon.voice.register}.` +
      (canon.voice.language ? ` Primary language: ${canon.voice.language}.` : "") +
      (canon.voice.tics?.length ? ` Verbal habits: ${canon.voice.tics.join("; ")}.` : "")
  );
  if (canon.canon_facts.length)
    lines.push(`Immutable facts (never contradict): ${canon.canon_facts.join("; ")}.`);
  if (canon.boundaries.length)
    lines.push(`Boundaries: ${canon.boundaries.join("; ")}.`);
  if (memory.length)
    lines.push(
      `Continuity — remember these established facts about this conversation: ` +
        memory.map((m) => m.content).join("; ") +
        "."
    );
  lines.push(
    `Stay fully in character and consistent with the above at all times. Do not break character to describe yourself as an AI unless safety requires it.`
  );
  return lines.join("\n");
}

// MCP 도구 get_persona_prompt 의 코어.
export async function getPersonaPrompt(sessionId: string): Promise<string | null> {
  const c = await getSessionCanon(sessionId);
  if (!c) return null;
  const memory = await getCharacterMemory(sessionId);
  return composeSystemPrompt(c.canon, memory, c.scenario);
}

// ---------- 캐릭터 기억 ----------
export async function getCharacterMemory(
  sessionId: string,
  limit = 20
): Promise<CharacterMemory[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("character_memory")
    .select("kind, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as CharacterMemory[]).reverse();
}

// 기억 저장. 파생 원본(메시지)은 이미 입력 moderation 통과 상태지만, 저장 전 백스톱 재검사.
export async function recordCharacterMemory(
  sessionId: string,
  userId: string,
  items: CharacterMemory[]
): Promise<number> {
  const clean = items
    .map((i) => ({ ...i, content: i.content.trim() }))
    .filter((i) => i.content && !heuristicScan(i.content)); // 미성년/불법 흔적 사실은 저장 거부
  if (!clean.length) return 0;
  const admin = createAdminClient();
  await admin.from("character_memory").insert(
    clean.map((i) => ({
      session_id: sessionId,
      user_id: userId,
      kind: i.kind,
      content: i.content.slice(0, 500),
    }))
  );
  return clean.length;
}

// 사용자 메시지에서 지속 가능한 사실을 가볍게 추출(휴리스틱).
// 확장점: LLM 기반 추출로 교체 가능(정확도↑). MVP는 결정론적 패턴만.
export function extractDurableFacts(userMessage: string): CharacterMemory[] {
  const out: CharacterMemory[] = [];
  const text = userMessage.trim();
  let m: RegExpMatchArray | null;
  if ((m = text.match(/(?:내|제)\s*이름은\s*([^\s.,!?]{1,20})/)))
    out.push({ kind: "fact", content: `사용자 이름은 ${m[1]}` });
  if ((m = text.match(/나는?\s*([^\s.,!?]{1,30})\s*(?:을|를)\s*(?:좋아|선호)/)))
    out.push({ kind: "preference", content: `사용자는 ${m[1]}을(를) 좋아함` });
  if ((m = text.match(/my name is\s+([A-Za-z]{1,20})/i)))
    out.push({ kind: "fact", content: `User's name is ${m[1]}` });
  return out;
}

// ---------- 일관성 검사 (MCP 도구 check_consistency 의 코어) ----------
// 초안 응답이 캐논과 일치하는가. 안전(age_or_minor)은 하드, 나머지는 재생성 유도.
export function checkConsistency(
  canon: PersonaCanon,
  draftReply: string
): ConsistencyResult {
  const violations: ConsistencyViolation[] = [];
  const text = draftReply;

  // 1) 안전 백스톱(하드): 응답이 미성년/불법 흔적을 담으면 재생성으로도 통과 불가.
  //    (최종 차단 권한은 chat 라우트의 출력 moderation. 여기선 조기 신호.)
  if (heuristicScan(text)) {
    violations.push({
      type: "age_or_minor",
      detail: "reply matched minor/illegal heuristic",
      hard: true,
    });
  }
  // 봇이 자신을 미성년으로 서술하는 경우(정체성 파괴 + 안전) — 하드.
  if (/\b(1[0-7]|[1-9])\s?(?:yo|년|살|year)/i.test(text) &&
      !new RegExp(`${canon.identity.age}\\s?(?:살|년|yo|year)`).test(text)) {
    violations.push({
      type: "age_or_minor",
      detail: "reply implies an under-18 self age",
      hard: true,
    });
  }

  // 2) 정체성 모순: 다른 이름으로 자기를 지칭.
  const name = canon.identity.name;
  const selfNameClaim = text.match(/(?:내 이름은|제 이름은|저는|I am|I'm|My name is)\s*([A-Za-z가-힣]{1,20})/);
  // 한국어 조사가 이름에 붙을 수 있으므로(예: "Yuna예요") 정확 일치 대신 이름 포함 여부로 판정.
  if (
    selfNameClaim &&
    selfNameClaim[1] &&
    !selfNameClaim[1].toLowerCase().includes(name.toLowerCase())
  ) {
    violations.push({
      type: "identity_contradiction",
      detail: `reply self-identifies as "${selfNameClaim[1]}", canon name is "${name}"`,
      hard: false,
    });
  }

  // 3) 불변 사실 모순: 부정문에서 canon_fact 키워드가 함께 등장(간이 신호).
  for (const fact of canon.canon_facts) {
    const key = fact.split(/\s+/)[0];
    if (key && new RegExp(`(?:아니|안|not|never)[^.]*${escapeRe(key)}`, "i").test(text)) {
      violations.push({
        type: "canon_contradiction",
        detail: `reply may contradict canon fact: "${fact}"`,
        hard: false,
      });
    }
  }

  // 4) 말투/언어 이탈: 기본 언어가 ko인데 한글이 전혀 없음(응답이 충분히 길 때만).
  if ((canon.voice.language ?? "ko") === "ko" && text.length > 40 && !/[가-힣]/.test(text)) {
    violations.push({
      type: "out_of_voice",
      detail: "expected Korean voice but reply has no Hangul",
      hard: false,
    });
  }

  return { ok: violations.length === 0, violations };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
