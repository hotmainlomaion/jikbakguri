// #3 장면/위치 전환 감지(결정론적, 한국어).
// 사용자의 메시지에서 "소파로 가자", "집으로 가자", "침대에 누워", "화장실로 들어가자"처럼
// 장소/자리 이동을 감지해 (1) 새 위치, (2) 씬 전환 지문(작은 카드로 렌더), (3) 이미지 배경 힌트를 만든다.
// 감지된 위치는 sessions.scene_location에 저장되어 이후 AI 대화·이미지 생성 배경에 지속 주입된다.

export interface SceneMove {
  moved: boolean;
  location: string | null; // 저장·주입용 한국어 라벨(예: '소파', '집', '침실')
  bgHint: string | null; // 이미지 배경 영어 힌트(예: 'living room sofa')
  narration: string | null; // 씬 전환 카드에 표시할 지문
}

// 장소/자리 사전: 별칭[] → { label(정규화 라벨), bg(영어 배경 힌트) }.
// 앞쪽이 더 구체적인 항목이 우선 매칭되도록 배열 순서를 유지한다.
const PLACES: { aliases: string[]; label: string; bg: string }[] = [
  { aliases: ["침대", "베드", "이불 속", "이불속"], label: "침대", bg: "on a bed, bedroom" },
  { aliases: ["침실", "안방", "내 방", "네 방", "우리 방", "방 안", "방안", "방으로", "방에"], label: "침실", bg: "bedroom, dim intimate lighting" },
  { aliases: ["소파", "쇼파", "카우치"], label: "소파", bg: "on a couch, living room" },
  { aliases: ["거실"], label: "거실", bg: "living room" },
  { aliases: ["욕조", "욕탕", "탕 안"], label: "욕조", bg: "in a bathtub, steamy bathroom" },
  { aliases: ["욕실", "샤워실", "샤워부스", "샤워"], label: "욕실", bg: "bathroom, shower, wet" },
  { aliases: ["화장실", "변기"], label: "화장실", bg: "bathroom stall" },
  { aliases: ["부엌", "주방", "싱크대"], label: "주방", bg: "kitchen" },
  { aliases: ["베란다", "발코니", "테라스"], label: "베란다", bg: "balcony at night, city lights" },
  { aliases: ["옥상"], label: "옥상", bg: "rooftop at night, city skyline" },
  { aliases: ["모텔", "호텔", "여관", "러브호텔"], label: "모텔 방", bg: "motel room, neon light through curtains" },
  { aliases: ["차 안", "차안", "자동차", "뒷좌석", "조수석", "차에"], label: "차 안", bg: "inside a parked car at night" },
  { aliases: ["사무실", "회사", "오피스", "탕비실"], label: "사무실", bg: "office after hours" },
  { aliases: ["교실", "빈 교실", "강의실"], label: "교실", bg: "empty classroom after school" },
  { aliases: ["편의점 창고", "창고"], label: "창고", bg: "back storage room" },
  { aliases: ["편의점"], label: "편의점", bg: "convenience store interior at night" },
  { aliases: ["포장마차", "술집", "바", "펍"], label: "술집", bg: "dim bar counter at night" },
  { aliases: ["해변", "바닷가", "바다"], label: "해변", bg: "beach at dusk" },
  { aliases: ["공원", "벤치"], label: "공원", bg: "quiet park at night" },
  { aliases: ["정원", "뒤뜰", "마당"], label: "정원", bg: "garden at night" },
  { aliases: ["집", "우리집", "너희 집", "네 집", "내 집", "자취방", "원룸"], label: "집", bg: "at home, cozy apartment interior" },
];

// 이동/자리잡기 동사 어간(어미 제외). 장소 별칭 뒤(또는 '으로/로/에/까지' 뒤)에 근접해야 인정.
const MOVE = [
  "가자", "가서", "가고", "갈까", "갈래", "가볼", "가 보", "가는", "가버", "가요", "가는게",
  "이동", "이사", "옮겨", "옮기", "옮길", "들어가", "들어와", "들어오", "나가", "나오",
  "올라가", "올라와", "내려가", "내려와", "건너", "향해", "향하",
  "눕자", "눕히", "누워", "누울", "누웠", "앉자", "앉아", "앉을", "앉혀", "앉았",
  "오자", "오라", "와라", "와서", "와줘", "따라와", "데려가", "데리고", "가버리",
];

// 받침 유무 판정(한글 마지막 글자).
function hasJong(word: string): boolean {
  const ch = (word || "").trim().slice(-1);
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false; // 한글 음절 아님
  return (code - 0xac00) % 28 !== 0;
}
// 장소 + '(으)로': 받침 있고 ㄹ이 아니면 '으로', 그 외 '로'.
function josaRo(word: string): string {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return word + "로";
  const jong = (code - 0xac00) % 28;
  return jong === 0 || jong === 8 /* ㄹ */ ? `${word}로` : `${word}으로`;
}
// 주어 조사 이/가.
function josaIGa(word: string): string {
  return hasJong(word) ? `${word}이` : `${word}가`;
}

// 캐릭터 반응(장소 이동 시 곁으로 오는 묘사). 결정론적으로 메시지 길이로 선택(랜덤 불가 환경).
const REACTIONS = [
  "옆에 와서 살며시 앉는다",
  "곁으로 다가와 몸을 붙인다",
  "뒤따라와 가까이 선다",
  "먼저 걸어가 자리를 잡고 돌아본다",
  "손을 잡고 함께 걸음을 옮긴다",
];

const MOVE_RE = MOVE.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");

// 메시지에서 '장소 + (으로/로/에/까지)? + 근접 이동동사' 패턴을 찾아 이동 여부·목적지를 판정.
export function detectSceneMove(
  message: string,
  botName: string,
  currentLocation: string | null
): SceneMove {
  const none: SceneMove = { moved: false, location: null, bgHint: null, narration: null };
  const text = (message || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return none;

  for (const place of PLACES) {
    for (const alias of place.aliases) {
      const a = alias.toLowerCase();
      // 단어 경계 매칭: 앞 글자가 한글이면 다른 단어의 일부(예: '주방으로'의 '방으로') → 무시.
      let idx = text.indexOf(a);
      while (idx > 0 && /[가-힣]/.test(text[idx - 1])) idx = text.indexOf(a, idx + 1);
      if (idx === -1) continue;
      // 별칭 뒤 최대 6글자 안에 이동 동사가 오는지(조사 으로/로/에/까지/한테 허용).
      const after = text.slice(idx + a.length, idx + a.length + 8);
      const tail = after.replace(/^(으로|로|에서|에|까지|한테|쪽으로|쪽|편으로)?\s*/, "");
      const near = `${after} ${tail}`;
      // 부정/거절 문맥이면 이동으로 보지 않음(예: '집에 가기 싫어', '침대로 가지 마').
      const negZone = text.slice(idx, idx + a.length + 16);
      if (/(싫|말자|말고|하지\s?마|가지\s?마|안\s?가|못\s?가|말래|안\s?돼|하면\s?안)/.test(negZone)) continue;
      if (new RegExp(`(${MOVE_RE})`).test(near)) {
        // 이미 그 장소면 카드/갱신 없음.
        if (currentLocation && currentLocation === place.label) return none;
        const roForm = josaRo(place.label);
        const reaction = REACTIONS[text.length % REACTIONS.length];
        const narration = `${roForm} 자리를 옮긴다. ${josaIGa(botName)} ${reaction}.`;
        return { moved: true, location: place.label, bgHint: place.bg, narration };
      }
    }
  }
  return none;
}

// 저장된 위치 라벨 → 이미지 배경 영어 힌트(장소가 바뀌지 않은 턴에도 배경 유지용).
export function bgHintFor(location: string | null): string | null {
  if (!location) return null;
  const p = PLACES.find((x) => x.label === location);
  return p ? p.bg : location;
}
