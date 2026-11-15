// 관련 규제 및 법령 표를 최신 발표와 대조한다(조회만, 표는 바꾸지 않음). 누구나 쓸 수 있고, 접속당 1시간에 3번까지.
// POST { current: <지금 regulations.json> }
//   → { checkedAt, summary, changes:[{…, ok, why}], outlook, next }  (next는 [반영] 때 그대로 보냄)
// AI는 표 전체를 다시 쓰지 않는다. 바꿀 항목(patch)만 내고, 서버가 그 항목만 고친다.
import Anthropic from "@anthropic-ai/sdk";
import { json, limit, KEY, STATUSES, validRegs } from "./_admin.js";

const MODEL = "claude-sonnet-5-5"; // 조회는 비용을 줄이려고 Sonnet을 씀
const client = new Anthropic();

const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10); // 한국 날짜

function promptFor(cur, date) {
  const slim = { ...cur, history: cur.history.slice(-5) };
  return `오늘은 ${date}(한국 시간)입니다. 아래는 한국 재무설계 상담 도구가 쓰는 '관련 규제 및 법령' 표(JSON)입니다. 마지막 갱신은 ${cur.updated}입니다.

할 일
1. 웹 검색으로 이 표의 내용이 지금도 맞는지 확인하고, ${cur.updated} 이후 바뀐 것을 찾으세요. 대상: 부동산 규제지역(조정대상·투기과열·토지거래허가), 규제지역이면 달라지는 대출·세금 규칙, 연말정산 소득·세액공제, 표의 법령 값(국민연금·건강보험·장기요양 요율, 세율 등).
2. 앞으로 바뀔 것(outlook)을 다시 조사해 전체 목록으로 내세요. status는 다음 셋 중 하나만 씁니다.
   - "시행 예정": 법·시행령·고시가 확정되어 시기만 남은 것
   - "높은 가능성": 정부안 발표, 국회 심의 중
   - "보도·검토(미확정)": 언론 보도·검토 단계, 공식 확정 아님
3. 출처는 정책브리핑(korea.kr), 국토교통부, 기획재정부, 보건복지부, 국민연금공단, 국세청, 금융위원회, 국가법령정보센터(law.go.kr)를 먼저 쓰고, 언론 보도는 outlook에만 씁니다.

규칙
- 검색으로 확인한 것만 쓰세요. 확인하지 못한 값은 바꾸지 말고, 추측으로 채우지 마세요.
- 바뀐 것이 없으면 changes는 빈 목록입니다. 억지로 찾지 마세요.
- 모든 change와 outlook에는 실제로 열어 본 출처 URL을 넣으세요.
- 바꿀 항목은 patch로 지정합니다. 항목을 찾는 키: regions는 name, rules는 topic, deductions·laws는 item (지금 표에 있는 값을 글자 그대로).
  - 고치기: {"op":"update","section":"laws","key":"보험료율","set":{"value":"…","status":"확인됨","checked":"${date}"}}
  - 추가: {"op":"add","section":"regions","set":{<새 항목 전체>}}  (regions 추가에는 name, area, match(지역 이름 배열), adjust, speculative, landPermit, since를 모두 넣음)
  - 삭제(지정 해제 등): {"op":"remove","section":"regions","key":"…"}
- deductions·laws를 고칠 때는 status("확인됨" 또는 "원문 대조 필요")와 checked("${date}")를 함께 고치세요.
- 모든 문장은 한국어로, 짧고 평이하게 쓰세요.

답은 JSON 하나만 쓰세요. 앞뒤 설명이나 코드 펜스는 쓰지 마세요.
{"checkedAt":"${date}","summary":"한두 문장","basis":"표 기준 설명 한 문장(바뀌었을 때만, 아니면 빈 문자열)",
 "changes":[{"kind":"지역 추가|지역 해제|규제 변경|기간 변경|법령 값 변경","target":"","before":"","after":"","date":"발표·시행일","source":{"title":"","url":""},"patch":{…}}],
 "outlook":[{"status":"","topic":"","what":"","when":"","impact":"이 표·계산의 어디에 영향","source":{"title":"","url":""}}]}

지금 표:
${JSON.stringify(slim)}`;
}

function parseJson(text) {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try { return JSON.parse(t); } catch (e) {}
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
  return null;
}

// patch를 적용한 새 표를 만든다. 적용하지 못한 change는 ok:false와 이유를 단다.
export function build(cur, res, date) {
  const next = structuredClone(cur);
  const changes = (Array.isArray(res.changes) ? res.changes : []).map((c) => {
    const p = c?.patch, key = KEY[p?.section];
    const fail = (why) => ({ ...c, ok: false, why });
    if (!p || !key) return fail("바꿀 위치를 알 수 없음");
    const list = next[p.section];
    if (p.op === "add") {
      if (!p.set || typeof p.set[key] !== "string" || !p.set[key].trim()) return fail("새 항목 이름 없음");
      if (list.some((x) => x[key] === p.set[key])) return fail("이미 있는 항목");
      if (p.section === "regions" && (!Array.isArray(p.set.match) || !p.set.match.length)) return fail("지역 대조용 이름(match) 없음");
      list.push(p.set);
      return { ...c, ok: true };
    }
    const i = list.findIndex((x) => x[key] === p.key);
    if (i < 0) return fail("표에서 항목을 찾지 못함");
    if (p.op === "remove") { list.splice(i, 1); return { ...c, ok: true }; }
    if (p.op === "update" && p.set && typeof p.set === "object") {
      const set = { ...p.set }; delete set[key]; // 이름(키)은 바꾸지 않음
      list[i] = { ...list[i], ...set };
      return { ...c, ok: true };
    }
    return fail("알 수 없는 작업");
  });
  const outlook = (Array.isArray(res.outlook) ? res.outlook : []).filter((o) => o && STATUSES.includes(o.status) && o.topic && o.what);
  if (outlook.length) next.outlook = outlook;
  const applied = changes.filter((c) => c.ok);
  next.updated = date;
  if (res.basis && typeof res.basis === "string" && res.basis.trim()) next.basis = res.basis.trim();
  next.history.push({ date, what: applied.length ? `AI 조회 후 반영: ${applied.map((c) => c.target).filter(Boolean).join(", ")}` : `AI 조회 결과 바뀐 값 없음, 앞으로 바뀔 것 ${outlook.length}건 갱신` });
  for (const c of applied) {
    const u = c.source?.url;
    if (u && !next.sources.some((s) => s.url === u)) next.sources.push({ title: c.source.title || u, url: u });
  }
  return { next, changes, outlook };
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_request" }, 400); }
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: "not_configured", detail: "ANTHROPIC_API_KEY" }, 503);
  const cur = body?.current;
  const bad = validRegs(cur);
  if (bad) return json({ error: "bad_current", detail: bad }, 400);
  const deny = limit(request, "refresh", 3, 60 * 60_000);
  if (deny) return deny;

  const date = today();
  const messages = [{ role: "user", content: promptFor(cur, date) }];
  let msg;
  try {
    for (let turn = 0; turn < 4; turn++) {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 15, user_location: { type: "approximate", country: "KR", timezone: "Asia/Seoul" } }],
        messages,
      });
      msg = await stream.finalMessage();
      if (msg.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: msg.content }); // 검색이 길어 멈춘 경우 이어서 진행
    }
  } catch (e) {
    console.error("regs-refresh", e?.status, e?.message);
    const s = e?.status;
    return json({ error: s === 429 || s === 529 ? "rate_limited" : s === 401 || s === 403 ? "server_key" : "server_error" }, 502);
  }
  if (msg.stop_reason === "refusal") return json({ error: "refusal" }, 502);
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const res = parseJson(text);
  if (!res) return json({ error: "invalid_json" }, 502);

  const { next, changes, outlook } = build(cur, res, date);
  const bad2 = validRegs(next);
  if (bad2) return json({ error: "bad_result", detail: bad2 }, 502);
  return json({ checkedAt: date, summary: String(res.summary || ""), changes, outlook, next });
}
