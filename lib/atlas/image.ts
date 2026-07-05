// Atlas Cloud FLUX schnell 래퍼 (CLAUDE.md 4-B). LLM과 다른 REST 포맷/엔드포인트.
// 합성 프롬프트는 호출 전 moderation을 통과해야 한다(라우트가 강제).
// TODO(운영주체 확인): 실제 endpoint 응답 스키마에 맞춰 파싱 확정.
import { chatComplete } from "./llm";
import { applyKoNsfw, stripExplicitTags } from "./ko-nsfw";

export interface GeneratedImage {
  // 임시 URL 또는 base64. 라우트가 출력 모더레이션 후 Storage에 저장.
  url?: string;
  b64?: string;
}

// FLUX 프롬프트 빌더: FLUX의 T5 인코더는 영어 전용이므로 사용자 요청(한국어 등)을
// LLM(uncensored)으로 "영어 이미지 프롬프트"로 번역·구성한다. 정체성(얼굴/머리/체형)만
// 캐릭터에서 가져오고, 의상/노출/포즈/행동/배경은 사용자 지시를 그대로(검열/보정 없이) 반영.
// 실패 시 원문 합성으로 폴백(최소 동작). 안전은 라우트의 입력 moderation + 출력 스크리닝이 담당.
export type ImageStyle = "photoreal" | "anime";

// 한국 주요 고객 대상 실사 기본 미감(K-뷰티 스타일 프로파일).
// 레퍼런스(자연스러운 한국 미인/클린걸 룩)의 "공통 미감"만 정체성-중립 서술로 정제해 반영한다.
// ⚠️ 특정 실존 인물 얼굴 복제가 아니라 일반적 렌더 스타일(피부/메이크업/이목구비 결·촬영 톤)만 추가.
//    캐릭터 고유 정체성(머리색/눈/체형=appearance_desc)과 seed 일관성은 그대로 유지된다.
// 상세 기획: docs/korean-beauty-style.md
// ⚠️ 품질/촬영 톤 위주(얼굴 구조를 균질화하는 'clean-girl·v라인·정제된 이목구비·아이돌' 태그는 제거).
// 캐릭터별 고유 얼굴은 appearance_desc가 결정하도록, 여기선 '한국 미인 피부/사진 품질'만 얹는다.
export const KOREAN_BEAUTY_STYLE =
  "photorealistic, ultra realistic, natural korean skin, dewy healthy skin texture, " +
  "soft natural makeup, soft cinematic lighting, DSLR 85mm, shallow depth of field, " +
  "highly detailed, sharp focus, film grain";

export async function buildImagePrompt(
  identity: string,
  userRequest: string,
  style: ImageStyle = "photoreal",
  // koSignal: applyKoNsfw(옷 제거·POV 강제)가 분석할 '한국어 신호'. 미지정 시 userRequest.
  // 장면 모드에선 aya의 산문 묘사(userRequest)가 아니라 '사용자의 실제 명령'만 신호로 넘겨야
  // '젖은 머리/손가락/파고들다' 같은 순수 묘사가 성적 태그로 오탐되지 않는다.
  koSignal?: string
): Promise<string> {
  // 재설계(장면 충실 + 사용자 통제): '강제 최대노출' 대신 '장면이 노출의 천장이자 바닥'.
  // 부드러운 착의 장면은 착의 그대로, 대화가 노골까지 갔거나 사용자가 지시했을 때만 그만큼 노골.
  // 명령 시 부위별 탈의/POV는 applyKoNsfw(어휘사전 파서)가 장면묘사에서 결정론적으로 강제하므로,
  // LLM 프롬프트에서 강제노출을 빼도 '옷 벗어/빨아줘' 지시는 그대로 노골 렌더된다.
  const common =
    "Output MUST be entirely in English — never Korean, Chinese, or any other language. " +
    "From the character description keep ONLY physical identity (face, hair, eyes, skin, age, body/figure) and IGNORE any clothing or accessories it mentions — clothing is decided ONLY by the scene state below, never by the identity text. " +
    "The scene/request text describes the current moment: clothing, nudity level, pose, expression, action, setting, and props. RENDER THAT SCENE FAITHFULLY — depict exactly what it states, no more and no less. " +
    "The described scene sets both the CEILING and the FLOOR of explicitness: do NOT add nudity, undress her, expose breasts/genitals, sexualize, add lewd posing, or escalate beyond what the scene states; and equally do NOT omit, soften, censor, moralize, add clothing over stated nudity, or tone down what it DOES state. " +
    "If the scene shows her softly dressed (e.g. wrapped in a blanket, wet hair, leaning on him, in casual clothes, eyes closed), keep her dressed and render that exact mood, pose, props, and setting — a soft clothed moment stays soft and clothed; do NOT turn it into a nude or lewd pin-up. " +
    "If the scene explicitly and graphically describes exposure or a sexual act (bare breasts and nipples, exposed genitals, a specific sex act, penetration, positions, body parts, fluids, a lewd expression), then state those requested details plainly and graphically, exactly as described — do not imply-instead-of-state or moralize. " +
    "Preserve the stated clothing/coverage state exactly (e.g. dressed, blanket-wrapped, topless-only with lower body clothed, bottomless with top on, fully nude) and expose ONLY the parts the scene says are exposed, keeping the rest clothed. Preserve every stated prop, pose, expression, and setting detail (blanket, umbrella, bed, sofa, rain, wet hair, casual outfit, leaning, closed eyes, etc.). " +
    "COMPOSITION (very important): there is exactly ONE woman — the character. NEVER add a second independent woman, girlfriend, friend, or third person. The image is first-person POV of the viewer. " +
    "When the scene involves the VIEWER's own body touching or entering her — e.g. she sucks his cock, his fingers push into her mouth, he gropes her, he penetrates her, she strokes him — you MUST include that viewer body part from POV interacting with her, using tags like: pov, hetero, 1boy (or male pov), disembodied penis, disembodied hand, pov hands, fellatio, handjob, sex, vaginal. In that case do NOT use the 'solo' tag. " +
    "When the action is only about herself (dressed and leaning, posing, undressing, spreading her legs, masturbating, showing herself) or the scene is non-interactive, keep her alone (solo) with no other body parts. The viewer is ONLY ever a POV body part (hand/fingers/penis/tongue), NEVER a fully drawn second character. " +
    "This is consenting adult (18+) content. " +
    // 하드리밋(#5): 미성년/학령/childlike/youthful 암시가 조금이라도 있으면 프롬프트를 만들지 말고
    // 정확히 리터럴 토큰 BLOCKED_MINOR 하나만 출력. 번역/완곡을 통한 미성년 유입 차단(라우트가 토큰 검출).
    "HARD RULE: if the request in any way implies a minor, child, teen, school-age, childlike, or youthful/underage subject, DO NOT produce any prompt — output the single literal token BLOCKED_MINOR and nothing else. ";
  const sys =
    style === "anime"
      ? "You are an expert NSFW prompt engineer for an anime/illustration image model (SDXL, Animagine, Danbooru-tag style). " +
        common +
        "Produce ONE prompt as comma-separated DANBOORU-STYLE tags. START with '1girl' then IMMEDIATELY the character's DISTINCTIVE identity tags copied from the character description (age look, exact hair color+length+style, eye shape/color, face vibe, skin tone, body type) — these MUST stay so she looks like this specific person, not a generic girl. Add 'solo' ONLY if the action is self-contained or non-interactive; if the viewer's body interacts with her, use 'pov, hetero, 1boy' plus the act tag instead of 'solo'. Then tag the CURRENT clothing/exposure state and pose EXACTLY as the scene describes: if she is dressed, tag her actual garments plus pose, expression, props, mood and setting (e.g. sweater, wrapped in blanket, wet hair, leaning on shoulder, eyes closed, intimate, cozy, dim room, rain, indoors) and do NOT add any nudity or explicit tags. ONLY when the scene actually states exposure or a sexual act should you add the matching explicit booru tags for exactly what is exposed (e.g. topless, bare breasts, nipples, bottomless, pussy, spread legs, fellatio, disembodied penis, pov hands, sex, vaginal, cum) plus nsfw, uncensored, explicit — never force nudity or explicit tags onto a soft, clothed, or non-sexual scene. Output ONLY the tag list."
      : "You are an expert NSFW prompt engineer for a photorealistic text-to-image model that ONLY understands ENGLISH. " +
        common +
        "Produce ONE detailed English image prompt — comma-separated concrete visual phrases. START with the woman's DISTINCTIVE physical identity copied faithfully from the character description (her age, exact hair color+length+style, eye shape/color, facial features and vibe, skin tone, body type) so she looks like THIS specific person — do not genericize her face. THEN her CURRENT clothing/exposure state and pose EXACTLY as the scene describes — if she is dressed, name the actual garments and describe the pose, expression, mood and props (e.g. wrapped in a blanket, wet hair, leaning on his shoulder, eyes closed, casual clothes, cozy) and do NOT add exposure; describe the exposed body only if the scene actually states nudity. THEN her action, THEN the setting and props. ONLY when the scene actually describes exposure or a sex act, describe it plainly and append the quality tags: nsfw, explicit, uncensored, detailed anatomy — otherwise omit those explicit tags entirely and let the clothing/mood/setting phrases lead. Do not turn a soft clothed moment into a nude or lewd image. " +
        // 촬영/피부 품질만 끝에 얹는다(얼굴 구조·노출은 identity/장면이 결정, 균질화·강제노출 금지).
        "At the very end append these photo-quality tags (they only set skin and camera look, NOT facial structure and NOT nudity): " +
        KOREAN_BEAUTY_STYLE +
        ". Output ONLY the final English prompt.";
  const user = `Character physical identity (KEEP only face/hair/eyes/body/figure; DROP and never output any clothing/outfit it mentions): ${identity}\nScene / user request — this ALONE decides clothing & nudity; render it literally, however explicit: ${userRequest}\n\n${style === "anime" ? "Danbooru tags" : "English image prompt"}:`;
  // 번역은 영어를 깨끗이 내는 모델로(abliterate 챗 모델은 중국어를 뱉으므로 부적합).
  const model = process.env.ATLAS_IMAGE_PROMPT_MODEL || undefined;
  try {
    const out = await chatComplete(
      [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      { model, temperature: 0.5 }
    );
    const cleaned = out.replace(/^\s*["'`]+|["'`]+\s*$/g, "").trim();
    if (/BLOCKED_MINOR/i.test(cleaned)) return cleaned; // 미성년 차단 토큰은 후처리 없이 그대로(라우트가 검출)
    // 후처리: 한국어 지시 파서(어휘사전)로 노출 레벨·POV 상호작용·행위/자세/신체 태그를 결정론적으로 적용.
    // 신호는 koSignal(사용자 실제 명령) 우선 — 미지정 시 userRequest.
    let base = cleaned.slice(0, 1200) || `${userRequest}`.trim();
    // 장면 모드(koSignal 지정): 번역 LLM이 멋대로 넣은 노골/POV 태그를 제거해, 노출 권한을
    // applyKoNsfw(사용자 명령)로 단일화한다 → 지시 없는 부드러운 장면이 노골화되지 않는다.
    if (koSignal !== undefined) base = stripExplicitTags(base);
    const composed = applyKoNsfw(base, koSignal ?? userRequest, style);
    // 캐릭터 고유 얼굴을 맨 앞에(CLIP 77토큰 우선순위) → 캐릭터마다 얼굴이 뚜렷이 달라진다.
    return `${identityAnchor(identity)}, ${composed}`;
  } catch {
    const composed = applyKoNsfw(`${userRequest}`.trim(), koSignal ?? userRequest, style);
    return `${identityAnchor(identity)}, ${composed}`;
  }
}

// 캐릭터 고유 정체성 앵커: 옷/장신구 표현을 걷어내고 얼굴/머리/눈/피부/나이/체형 등 '식별 특징'만 남겨
// 프롬프트 맨 앞에 둔다. CLIP 77토큰 한계에서 얼굴 디스크립터가 잘리지 않게 하는 게 목적.
function identityAnchor(identity: string): string {
  const garments =
    /\b(fully clothed|clothed|dressed|outfit|wearing[^,]*|dress|t-?shirt|shirt|blouse|cardigan|sweater|knit(wear)?|hoodie|jacket|coat|skirt|shorts|pants|trousers|jeans|leggings|uniform|sports bra|\bbra\b|panties|underwear|lingerie|off one shoulder|oversized[^,]*|loose linen[^,]*|linen shirt[^,]*|layered[^,]*necklaces?|necklaces?|jewelry)\b/gi;
  const a = (identity || "")
    .replace(garments, "")
    .replace(/\s*,\s*(,\s*)+/g, ", ")
    .replace(/^[,\s]+|[,\s]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return a.slice(0, 220);
}

// 대화 맥락 → "지금 이 순간" 장면 요청 생성(이미지 버튼: 장면 충실 + 사용자 통제).
// 설정된 시나리오 + 지금까지의 대화 + 현재 묘사된 옷/포즈/배경/무드를 충실히 요약한다(고정 외형 제외).
// 수위는 대화가 실제로 도달한 딱 그 수준으로 — 임의로 더 벗기지도, 얌전하게 줄이지도 않는다.
// 명령 시 부위별 탈의/POV는 applyKoNsfw가 이 묘사에서 결정론적으로 강제한다. 안전은 라우트 모더레이션.
export interface SceneScenario {
  title?: string | null;
  description?: string | null;
  detail?: string | null;
  scenario?: string | null;
}
export async function buildSceneRequest(
  history: { role: string; content: string }[],
  sceneLocation?: string | null, // #3 현재 장소(sessions.scene_location) — 배경을 이 장소로 고정.
  scenario?: SceneScenario | null // 설정된 시나리오(제목/상황/상세/세계관) — 장면의 기본 전제.
): Promise<string> {
  const recent = history
    .filter((m) => (m.content ?? "").trim())
    .slice(-8)
    .map((m) => `${m.role === "user" ? "상대" : "그녀"}: ${m.content}`)
    .join("\n");
  if (!recent.trim()) return "";

  const sc = scenario;
  const scenarioContext =
    sc && (sc.title || sc.description || sc.detail || sc.scenario)
      ? "[설정된 시나리오 — 장면의 기본 전제(배경·관계·무드). 대화가 이를 바꾸지 않았다면 그대로 유지하라]\n" +
        (sc.title ? `· 제목: ${sc.title}\n` : "") +
        (sc.description ? `· 상황: ${sc.description}\n` : "") +
        (sc.detail ? `· 상세: ${sc.detail}\n` : "") +
        (sc.scenario ? `· 세계관: ${sc.scenario}\n` : "")
      : "";
  const locationRule = sceneLocation
    ? `[현재 위치] 두 사람은 지금 '${sceneLocation}'에 있다 — 배경을 이 장소로 하고 다른 곳으로 바꾸지 마라.`
    : "";

  const sys =
    "너는 성인(18+) 롤플레이 대화를 '지금 이 순간의 한 장면'으로 요약하는 도우미다. 이 이미지는 지금 이 순간을 있는 그대로 찍는 사진이다 — 설정된 시나리오와 지금까지의 대화, 그리고 현재 묘사된 그녀의 모습·자세·옷 상태·주변 환경을 충실히 재현해야 한다. 임의로 더 벗기거나 더 야하게 만들지 말고, 반대로 얌전하게 줄이지도 마라. 화면에 '지금 보이는 것'만, 대화가 실제로 도달한 딱 그 수준으로 적는다.\n\n" +
    "[scenarioContext]\n\n[locationRule]\n\n작성 규칙:\n\n" +
    "1) 옷·노출 상태를 반드시 한 번은 명시하라(이게 가장 중요하다). 상태 추적 방식으로 판단한다: 기본값은 시나리오 설정과 대화가 함의하는 착의 상태다(예: 비 맞고 담요를 덮은 장면이면 '젖은 머리에 평상복을 입고 담요를 어깨까지 두른 채', 자다 깬 장면이면 '잠옷 차림으로'). 대화 중 명시적인 탈의 지시나 노출 서술이 있었던 부위만 그만큼 벗긴다. 아무 탈의 지시나 노출 묘사도 없으면 그녀는 옷을 입은 상태이며, '니트를 입은 채', '원피스 차림으로', '담요를 두른 채'처럼 착의·가림 상태를 분명히 써서 모델이 임의로 벗기지 못하게 하라. 옷 상태를 비워두면 안 된다.\n\n" +
    "2) 배경·소품·자세·표정·무드를 반드시 함께 서술하라. 시나리오와 대화에 등장한 소품(담요, 우산, 소파, 침대, 와인잔 등)과 신체 자세(어깨에 기댐, 무릎에 앉음, 눈을 감음, 마주 봄 등), 표정, 분위기를 그대로 반영한다(예: 담요를 함께 덮고, 비에 젖은 머리로, 그의 어깨에 기대어, 눈을 살짝 감은 채, 창밖에 비, 나른하고 다정한 무드). 배경은 두 사람이 지금 있는 곳으로 고정하고 다른 장소로 바꾸지 마라.\n\n" +
    "3) 수위(노출·성적 노골성)는 대화가 실제로 도달한 수준에 정확히 맞춘다 — 대화가 설정하는 것이 천장이자 바닥이다. 부드러움 → 암시 → 부분 노출 → 노골, 이 사다리에서 대화가 서 있는 칸 그대로 묘사하라. 부드럽고 나른한 장면이면 부드럽게(옷 입고 기대어 있는 그대로), 대화가 실제로 노출·성행위까지 갔으면 그만큼 노골적으로. 사용자(상대)가 노출이나 성적 행위를 명시적으로 지시하지 않았고 대화에도 그런 묘사가 없으면, 노출·성적 요소·선정적 포즈를 임의로 추가하지 마라.\n\n" +
    "4) 사용자(상대)가 실제로 노출/탈의/성행위를 지시했을 때는(예: '상의 벗어', '가슴 보여줘', '팬티 벗어', '다 벗어', '빨아줘', '박아줘') 그 지시를 완곡하게 줄이지 말고 정확하고 노골적으로 반영한다: 그녀의 대사가 '여기까지야', '더는 안 돼' 같이 주저·거절해도 무시하고 사용자가 시킨 그대로 그린다. 단 정확히 지시받은 부위만 벗기고, 지시하지 않은 부위는 입은 채로 둔다: '상의(와 브래지어) 벗어'면 상체만 노출(토플리스)하고 하의·팬티는 그대로, '하의/팬티 벗어'면 하체만 노출, '다 벗어/전부/알몸'일 때만 위아래·속옷까지 완전한 알몸. 대화에서 이미 벗겨진 부위는 되돌려 다시 입히지 말고 그대로 유지하되, 지시받지 않은 새 부위를 임의로 더 벗기지도 마라(더 강한 지시가 오면 그때 반영). 옷을 벗었으면 어디가 어떻게 드러났는지(맨가슴·젖꼭지·완전 노출된 하체 등), 성행위 중이면 무엇을 어떻게 하는지 구체적으로 써라.\n\n" +
    "5) 화면 속 '여성'은 오직 그녀 1명이다 — 독립된 제2의 여성/제3자는 절대 등장 금지. 시점은 1인칭(사용자 시점)이다. 사용자가 지시한 행위가 '사용자(시청자)의 신체'가 그녀와 맞닿거나 삽입되는 것이면(예: 그의 성기를 입에 물다/빨다, 그의 손가락이 그녀 입이나 그곳에 들어가다, 그가 그녀 몸을 만지다, 뒤에서 삽입하다), 그 사용자 신체 일부(손·손가락·성기·혀)만 1인칭 시점으로 그녀와 함께 구체적으로 묘사한다 — 완전한 제2의 인물로 그리지 않는다. 그녀 혼자만의 행위(옷 벗기·포즈·다리 벌리기·자위·자기 몸 보여주기)면 그녀 혼자로 묘사한다. 사용자는 늘 '신체 일부'로만 등장한다.\n\n" +
    "6) 인물의 고정 외형(얼굴/머리색/눈/피부/체형/나이)은 절대 쓰지 마라 — 그건 별도로 반영된다. 오직 옷·노출 상태·자세·표정·행위·배경·소품·무드만 써라.\n\n" +
    "출력은 한국어 한두 문장의 묘사만. 다른 말은 붙이지 마라.";
  const filledSys = sys.replace("[scenarioContext]", scenarioContext).replace("[locationRule]", locationRule);
  try {
    const out = await chatComplete(
      [
        { role: "system", content: filledSys },
        { role: "user", content: `대화:\n${recent}\n\n지금 장면 묘사:` },
      ],
      { temperature: 0.5 } // 충실도 우선(낮은 온도로 임의 창작 억제).
    );
    return out.replace(/^\s*["'`]+|["'`]+\s*$/g, "").trim().slice(0, 600);
  } catch {
    // 폴백: 마지막 상대 지시 그대로.
    return [...history].reverse().find((m) => m.role === "user")?.content?.slice(0, 300) ?? "";
  }
}

// ---------- 프로바이더 어댑터 계층(승급) ----------
// IMAGE_PROVIDER로 백엔드 전환. 로컬 SDXL(16GB Mac ~500s)에서 GPU/호스티드로 승급하면
// 애니 생성이 초~수초대로 빨라진다. 라우트/일관성(style·seed)·모더레이션은 그대로 재사용.
//  · local   : {prompt,style,seed,steps}→{b64|url} 커스텀 계약. 로컬 image-server.py 및
//              동일 계약을 GPU(RunPod/Vast/전용)에 올린 자체호스팅도 이 경로(코드 변경 0).
//  · novita  : Novita.ai 호스티드(NSFW 허용). async txt2img → task-result 폴링.
// 확장: 같은 GeneratedImage 계약으로 replicate/runpod 어댑터 추가 가능.
// 로컬 SDXL(Lustify) 생성 전, Ollama 모델(챗 aya + 이미지프롬프트 dolphin)을 언로드해 메모리를 비운다.
// 16GB에서 Ollama(~10GB 상주) + SDXL(~7GB) 동시 로드 시 OOM/BrokenPipe로 생성이 실패하기 때문.
// keep_alive:0 → 다음 챗 요청 때 aya가 재로드(콜드 ~10s). best-effort(실패해도 생성은 진행).
export async function freeLocalLLMs(): Promise<void> {
  const base = (process.env.ATLAS_LLM_BASE_URL ?? "").replace(/\/v1\/?$/, "");
  if (!base) return;
  const models = [process.env.ATLAS_LLM_MODEL, process.env.ATLAS_IMAGE_PROMPT_MODEL].filter(Boolean) as string[];
  await Promise.allSettled(
    models.map((model) =>
      fetch(`${base}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, keep_alive: 0 }),
        signal: AbortSignal.timeout(8000),
      })
    )
  );
}

export async function generateImage(
  prompt: string,
  opts?: { style?: ImageStyle; seed?: number | null }
): Promise<GeneratedImage> {
  const provider = (process.env.IMAGE_PROVIDER ?? "local").toLowerCase();
  const style = opts?.style ?? "photoreal";
  const seed = opts?.seed ?? null;
  if (provider === "novita") return generateNovita(prompt, style, seed);
  return generateLocal(prompt, style, seed);
}

// 로컬/자체호스팅(동일 커스텀 계약). image-server.py 및 GPU에 올린 동일 서버.
async function generateLocal(prompt: string, style: ImageStyle, seed: number | null): Promise<GeneratedImage> {
  const baseURL = process.env.ATLAS_IMAGE_BASE_URL;
  const apiKey = process.env.ATLAS_IMAGE_API_KEY;
  const model = process.env.ATLAS_IMAGE_MODEL ?? "flux-schnell";
  if (!baseURL || !apiKey) throw new Error("ATLAS_IMAGE env not configured"); // TODO(운영주체 확인)

  const resp = await fetch(baseURL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    // style로 백엔드 분기(photoreal=FLUX / anime=SDXL), seed로 캐릭터 일관성.
    body: JSON.stringify({ model, prompt, style, seed: seed ?? undefined, steps: style === "anime" ? 26 : 4, n: 1 }),
    // 로컬(16GB): 애니(SDXL)는 ~130s+로드라 넉넉히.
    signal: AbortSignal.timeout(Number(process.env.ATLAS_IMAGE_TIMEOUT_MS ?? 600_000)),
  });
  if (!resp.ok) throw new Error(`atlas image ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  // 구조 기반 파싱(위치 가정 최소화).
  const item = data?.data?.[0] ?? data?.images?.[0] ?? data;
  return { url: item?.url, b64: item?.b64_json ?? item?.b64 };
}

// Novita.ai 호스티드(NSFW 허용). async txt2img(POST) → task_id → task-result 폴링.
// 모델명은 카탈로그별로 다르므로 env로 주입: 실사=NOVITA_MODEL_PHOTOREAL, 애니=NOVITA_MODEL_ANIME.
async function generateNovita(prompt: string, style: ImageStyle, seed: number | null): Promise<GeneratedImage> {
  const key = process.env.NOVITA_API_KEY;
  if (!key) throw new Error("NOVITA_API_KEY not configured");
  const model =
    style === "anime"
      ? process.env.NOVITA_MODEL_ANIME // 예: Pony/Illustrious/anime SDXL 체크포인트(TODO 운영주체 확인)
      : process.env.NOVITA_MODEL_PHOTOREAL; // 예: 실사 SDXL/FLUX 체크포인트
  if (!model) throw new Error(`NOVITA_MODEL_${style === "anime" ? "ANIME" : "PHOTOREAL"} not configured`);

  const base = process.env.NOVITA_BASE_URL ?? "https://api.novita.ai";
  const auth = { authorization: `Bearer ${key}`, "content-type": "application/json" };
  const neg =
    "lowres, bad anatomy, bad hands, extra digits, worst quality, low quality, jpeg artifacts, " +
    "signature, watermark, censored, mosaic censoring, bar censor";

  // 1) 작업 제출.
  const submit = await fetch(`${base}/v3/async/txt2img`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      extra: { response_image_type: "png" },
      request: {
        model_name: model,
        prompt,
        negative_prompt: neg,
        width: style === "anime" ? 832 : 768,
        height: style === "anime" ? 1216 : 1024,
        image_num: 1,
        steps: Number(process.env.NOVITA_STEPS ?? (style === "anime" ? 28 : 20)),
        guidance_scale: Number(process.env.NOVITA_GUIDANCE ?? (style === "anime" ? 5 : 3.5)),
        sampler_name: process.env.NOVITA_SAMPLER ?? "Euler a",
        seed: seed ?? -1,
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!submit.ok) throw new Error(`novita submit ${submit.status}: ${await submit.text()}`);
  const taskId = (await submit.json())?.task_id;
  if (!taskId) throw new Error("novita: no task_id");

  // 2) 결과 폴링(task-result). SUCCEED면 image_url 반환, FAILED면 throw.
  const deadline = Date.now() + Number(process.env.NOVITA_TIMEOUT_MS ?? 120_000);
  for (;;) {
    if (Date.now() > deadline) throw new Error("novita: poll timeout");
    await new Promise((r) => setTimeout(r, 2_000));
    const res = await fetch(`${base}/v3/async/task-result?task_id=${encodeURIComponent(taskId)}`, {
      headers: auth,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) continue; // 일시 오류는 재시도
    const data = await res.json();
    const status: string = data?.task?.status ?? "";
    if (status.includes("FAILED")) throw new Error(`novita task failed: ${data?.task?.reason ?? ""}`);
    const url = data?.images?.[0]?.image_url;
    if (url) return { url }; // 임시 URL — 라우트가 즉시 fetch해 저장.
  }
}
