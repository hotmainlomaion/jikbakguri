import { analyzeKoNsfw, applyKoNsfw } from "./lib/atlas/ko-nsfw";

const style = "photoreal" as const;

const bases: Record<string, string> = {
  "LLM-compliant-fellatio":
    "1girl, solo, kneeling, mouth open, looking up, indoor bedroom, warm light, nsfw",
  "LLM-softened-no-act":
    "1girl, solo, sitting on bed, wearing a sweater, shy smile, cozy dim room",
  "LLM-empty-fallback": "",
};

for (const [label, base] of Object.entries(bases)) {
  console.log("### BASE:", label, "=>", JSON.stringify(base));
  const req = "내 걸 빨아줘";
  const d = analyzeKoNsfw(`${req}\n${base}`, style);
  console.log("  directives:", JSON.stringify(d));
  const composed = applyKoNsfw(base || req, req, style);
  console.log("  composed:", composed);
  console.log("");
}

console.log("---- ANIME style, compliant base ----");
{
  const req = "내 걸 빨아줘";
  const base = "1girl, solo, kneeling, mouth open, looking up, indoors, nsfw";
  const d = analyzeKoNsfw(`${req}\n${base}`, "anime");
  console.log("  directives:", JSON.stringify(d));
  console.log("  composed:", applyKoNsfw(base, req, "anime"));
}

console.log("\n---- VARIANTS (photoreal) ----");
for (const req of ["빨아줘", "내걸 빨아줘", "내 것 좀 빨아줘", "자지 빨아줘", "펠라 해줘", "입으로 해줘", "내 자지 핥아줘"]) {
  const d = analyzeKoNsfw(req, style);
  console.log(`  ${JSON.stringify(req)} -> pov=${d.pov} level=${d.level} tags=${JSON.stringify(d.tags)}`);
}
