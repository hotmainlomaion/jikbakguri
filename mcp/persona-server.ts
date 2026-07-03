// ============================================================
// mcp/persona-server.ts — 페르소나 일관성 MCP 서버.
// lib/persona/core.ts 의 동일 코어를 MCP resources/tools 로 노출한다(두 번째 진입점).
// 실행: `npm run mcp:persona` (tsx). Supabase 환경변수 필요.
//
// 안전: 이 서버는 moderation을 대체하지 않는다. record/check 는 추가 방어일 뿐이며,
//       미성년/불법 판정 최종 권한은 chat 라우트의 lib/moderation 에 있다.
// ============================================================
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getPersonaPrompt,
  getSessionCanon,
  getCharacterMemory,
  recordCharacterMemory,
  checkConsistency,
} from "@/lib/persona/core";

const server = new McpServer({ name: "persona-consistency", version: "0.1.0" });

// ---------- Resource: 세션에 고정된 캐논(읽기 전용 진실원천) ----------
server.registerResource(
  "session-canon",
  new ResourceTemplate("persona://{sessionId}/canon", { list: undefined }),
  {
    title: "Session persona canon",
    description: "세션 수명 동안 고정된 봇 캐논(정체성·말투·경계·불변 사실).",
    mimeType: "application/json",
  },
  async (uri, { sessionId }) => {
    const c = await getSessionCanon(String(sessionId));
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(c?.canon ?? null),
        },
      ],
    };
  }
);

// ---------- Tool: 시스템 프롬프트 합성 ----------
server.registerTool(
  "get_persona_prompt",
  {
    description:
      "세션의 고정 캐논 + 최근 캐릭터 기억을 합성한 시스템 프롬프트를 반환. LLM 컨텍스트의 system 메시지로 사용.",
    inputSchema: { sessionId: z.string() },
  },
  async ({ sessionId }) => {
    const prompt = await getPersonaPrompt(sessionId);
    return {
      content: [{ type: "text", text: prompt ?? "" }],
      isError: !prompt,
    };
  }
);

// ---------- Tool: 캐릭터 기억 조회 ----------
server.registerTool(
  "get_character_memory",
  {
    description: "세션에서 확립된 연속성 사실(기억) 목록을 반환.",
    inputSchema: { sessionId: z.string() },
  },
  async ({ sessionId }) => {
    const mem = await getCharacterMemory(sessionId);
    return { content: [{ type: "text", text: JSON.stringify(mem) }] };
  }
);

// ---------- Tool: 캐릭터 기억 기록 ----------
server.registerTool(
  "record_character_memory",
  {
    description:
      "세션에 연속성 사실을 저장(저장 전 안전 백스톱 재검사). userId 는 프라이버시/삭제 귀속용.",
    inputSchema: {
      sessionId: z.string(),
      userId: z.string(),
      items: z
        .array(
          z.object({
            kind: z.enum(["fact", "relationship", "preference"]),
            content: z.string(),
          })
        )
        .min(1),
    },
  },
  async ({ sessionId, userId, items }) => {
    const n = await recordCharacterMemory(sessionId, userId, items);
    return { content: [{ type: "text", text: JSON.stringify({ stored: n }) }] };
  }
);

// ---------- Tool: 일관성 검사 ----------
server.registerTool(
  "check_consistency",
  {
    description:
      "초안 응답이 세션 캐논과 일치하는지 검사. hard=true 위반(안전)은 차단, soft 위반은 재생성 유도.",
    inputSchema: { sessionId: z.string(), draftReply: z.string() },
  },
  async ({ sessionId, draftReply }) => {
    const c = await getSessionCanon(sessionId);
    if (!c)
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: false, violations: [{ type: "canon_contradiction", detail: "no canon for session", hard: true }] }) }],
        isError: true,
      };
    const result = checkConsistency(c.canon, draftReply);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio: 로그는 stderr 로만.
  console.error("[persona-consistency] MCP server ready (stdio)");
}

main().catch((e) => {
  console.error("[persona-consistency] fatal:", e);
  process.exit(1);
});
